// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LinkVault} from "../src/LinkVault.sol";
import {MockNonStandardERC20} from "./mocks/MockNonStandardERC20.sol";
import {MaliciousERC20} from "./mocks/MaliciousERC20.sol";

/**
 * @title LinkVaultSecurityTest
 * @notice Security-focused tests covering:
 *         - Signature malleability (EIP-2 compliance)
 *         - Reentrancy protection during claim and refund
 *         - Non-standard ERC-20 tokens (USDT-style, no bool return)
 *         - Invalid signature parameters (v, edge cases)
 */
interface IReentrancyCallback {
    function onReceive() external;
}

contract LinkVaultSecurityTest is Test {
    LinkVault public vault;
    MockNonStandardERC20 public nonStandardToken;
    MaliciousERC20 public maliciousToken;

    address sender = makeAddr("sender");
    address recipient = makeAddr("recipient");
    address attacker = makeAddr("attacker");

    uint256 secretKey = 0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2;
    address claimKey;

    // secp256k1 curve order
    uint256 constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function setUp() public {
        vault = new LinkVault();
        nonStandardToken = new MockNonStandardERC20("NonStandard", "NST", 18);
        maliciousToken = new MaliciousERC20("Malicious", "MAL", 18);

        vm.deal(sender, 100 ether);
        nonStandardToken.mint(sender, 1_000_000 * 10 ** 18);
        maliciousToken.mint(sender, 1_000_000 * 10 ** 18);

        claimKey = vm.addr(secretKey);
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function _signClaim(uint256 depositId, address signerRecipient, uint256 privateKey)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 digest = vault.computeClaimDigest(depositId, signerRecipient);
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _createNativeLink(uint256 amount, uint40 expiryDuration)
        internal
        returns (uint256)
    {
        vm.startPrank(sender);
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + expiryDuration)
        );
        vm.stopPrank();
        return id;
    }

    // =================================================================
    // S-value Malleability (EIP-2)
    // =================================================================

    function test_RevertMalleableSignature_HighS() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);

        // Flip the s-value to its malleable counterpart: s' = N - s
        bytes32 malleableS = bytes32(SECP256K1_N - uint256(s));

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, recipient, v, r, malleableS);
    }

    function test_RevertMalleableSignature_HighSWithFlippedV() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);

        bytes32 malleableS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, recipient, flippedV, r, malleableS);
    }

    function test_RevertInvalidV_Zero() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);
        (, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, recipient, 0, r, s);
    }

    function test_RevertInvalidV_HighValue() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);
        (, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, recipient, 29, r, s);
    }

    function test_NormalSignatureStillWorksAfterMalleabilityCheck() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);
        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);

        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        assertTrue(vault.getDeposit(id).claimed);
    }

    // =================================================================
    // Fuzz: Malleability
    // =================================================================

    function testFuzz_MalleableSignatureAlwaysRejected(
        uint256 depositAmount,
        uint40 expiryDuration,
        address randomRecipient
    ) public {
        depositAmount = bound(depositAmount, 0.001 ether, 5 ether);
        expiryDuration = uint40(bound(uint256(expiryDuration), 60, 7 days));
        vm.assume(randomRecipient != address(0));
        vm.assume(randomRecipient != address(vault));
        vm.assume(uint160(randomRecipient) > 10000);
        vm.assume(randomRecipient.code.length == 0);

        vm.deal(sender, depositAmount);
        vm.prank(sender);
        uint256 id = vault.createLink{value: depositAmount}(
            address(0),
            depositAmount,
            claimKey,
            uint40(block.timestamp + expiryDuration)
        );

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, randomRecipient, secretKey);
        bytes32 malleableS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vm.prank(attacker);
        vault.claim(id, randomRecipient, flippedV, r, malleableS);
    }

    // =================================================================
    // Non-Standard ERC-20 (USDT-style, no bool return)
    // =================================================================

    function test_NonStandardERC20_CreateAndClaim() public {
        uint256 amount = 100 * 10 ** 18;

        vm.startPrank(sender);
        nonStandardToken.approve(address(vault), amount);
        uint256 id = vault.createLink(
            address(nonStandardToken),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        assertEq(nonStandardToken.balanceOf(address(vault)), amount);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        assertEq(nonStandardToken.balanceOf(recipient), amount);
        assertEq(nonStandardToken.balanceOf(address(vault)), 0);
    }

    function test_NonStandardERC20_Refund() public {
        uint256 amount = 100 * 10 ** 18;

        vm.startPrank(sender);
        nonStandardToken.approve(address(vault), amount);
        uint256 id = vault.createLink(
            address(nonStandardToken),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours + 1);

        uint256 senderBefore = nonStandardToken.balanceOf(sender);

        vm.prank(sender);
        vault.refund(id);

        assertEq(nonStandardToken.balanceOf(sender), senderBefore + amount);
    }

    // =================================================================
    // Reentrancy Protection (ERC-20)
    // =================================================================

    function test_Reentrancy_ERC20ClaimBlocked() public {
        uint256 amount = 100 * 10 ** 18;

        ReentrancyAttacker ra = new ReentrancyAttacker(payable(address(vault)), address(maliciousToken));

        // Sender creates a link with malicious token, recipient = attacker contract
        vm.startPrank(sender);
        maliciousToken.approve(address(vault), amount);
        uint256 id = vault.createLink(
            address(maliciousToken),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        // Configure malicious token to callback attacker on transfer
        maliciousToken.setCallbackTarget(address(ra));
        maliciousToken.setShouldCallback(true);

        // Sign claim with attacker contract as recipient
        bytes32 digest = vault.computeClaimDigest(id, address(ra));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(secretKey, digest);

        // Execute the attack
        ra.attackClaim(id, v, r, s);

        // The reentrancy attempt should have failed
        assertFalse(ra.reenterSucceeded());
        assertTrue(ra.reenterAttempted());

        // Original claim succeeded — single transfer
        assertTrue(vault.getDeposit(id).claimed);
        assertEq(maliciousToken.balanceOf(address(ra)), amount);
    }

    function test_Reentrancy_ERC20RefundBlocked() public {
        uint256 amount = 100 * 10 ** 18;

        // Deploy a sender contract that triggers reentrancy on refund
        ReentrancyRefunder reenterRefunder =
            new ReentrancyRefunder(payable(address(vault)), address(maliciousToken));

        // Fund the refunder contract with malicious tokens
        maliciousToken.mint(address(reenterRefunder), amount);

        // Create a deposit from the refunder contract
        vm.prank(address(reenterRefunder));
        maliciousToken.approve(address(vault), amount);

        vm.prank(address(reenterRefunder));
        uint256 id = vault.createLink(
            address(maliciousToken),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );

        // Set the target deposit ID for reentrancy
        reenterRefunder.setTargetId(id);

        // Warp past expiry
        vm.warp(block.timestamp + 1 hours + 1);

        // Configure malicious token to callback on transfer
        maliciousToken.setCallbackTarget(address(reenterRefunder));
        maliciousToken.setShouldCallback(true);

        // Execute refund — the token transfer will trigger reentrancy attempt
        vm.prank(address(reenterRefunder));
        vault.refund(id);

        // Refund succeeded once, deposit claimed
        assertTrue(vault.getDeposit(id).claimed);
    }

    // =================================================================
    // Reentrancy Protection (Native MON)
    // =================================================================

    function test_Reentrancy_NativeClaimBlocked() public {
        uint256 amount = 1 ether;

        // Deploy a native reentrancy attacker
        NativeReentrancyAttacker na = new NativeReentrancyAttacker(payable(address(vault)));

        // Sender creates a link with native MON, recipient = attacker contract
        vm.deal(sender, amount);
        vm.prank(sender);
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );

        // Sign claim with attacker contract as recipient
        bytes32 digest = vault.computeClaimDigest(id, address(na));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(secretKey, digest);

        // Execute the attack
        na.attackClaim(id, v, r, s);

        // Reentrancy should have been blocked
        assertFalse(na.reenterSucceeded());
        assertTrue(na.reenterAttempted());

        // Original claim succeeded
        assertTrue(vault.getDeposit(id).claimed);
        assertEq(address(na).balance, amount);
    }
}

// =====================================================================
// Attacker Contracts
// =====================================================================

/**
 * @notice Attempts to re-enter claim() during ERC-20 token transfer callback.
 */
contract ReentrancyAttacker is IReentrancyCallback {
    LinkVault public vault;
    MaliciousERC20 public token;
    uint256 public targetId;
    uint8 public v;
    bytes32 public r;
    bytes32 public s;
    bool private _reenterAttempted;
    bool private _reenterSucceeded;

    constructor(address payable _vault, address _token) {
        vault = LinkVault(_vault);
        token = MaliciousERC20(_token);
    }

    function attackClaim(uint256 depositId, uint8 _v, bytes32 _r, bytes32 _s) external {
        targetId = depositId;
        v = _v;
        r = _r;
        s = _s;
        vault.claim(depositId, address(this), _v, _r, _s);
    }

    function onReceive() external override {
        _reenterAttempted = true;
        try vault.claim(targetId, address(this), v, r, s) {
            _reenterSucceeded = true;
        } catch {
            _reenterSucceeded = false;
        }
    }

    function reenterAttempted() external view returns (bool) {
        return _reenterAttempted;
    }

    function reenterSucceeded() external view returns (bool) {
        return _reenterSucceeded;
    }
}

/**
 * @notice Attempts to re-enter refund() during ERC-20 token transfer callback.
 *         This contract is both the sender and the reentrancy attacker.
 */
contract ReentrancyRefunder is IReentrancyCallback {
    LinkVault public vault;
    MaliciousERC20 public token;
    uint256 public targetId;
    bool private _reenterAttempted;
    bool private _reenterSucceeded;

    constructor(address payable _vault, address _token) {
        vault = LinkVault(_vault);
        token = MaliciousERC20(_token);
    }

    function setTargetId(uint256 _id) external {
        targetId = _id;
    }

    function onReceive() external override {
        _reenterAttempted = true;
        try vault.refund(targetId) {
            _reenterSucceeded = true;
        } catch {
            _reenterSucceeded = false;
        }
    }

    function reenterAttempted() external view returns (bool) {
        return _reenterAttempted;
    }

    function reenterSucceeded() external view returns (bool) {
        return _reenterSucceeded;
    }
}

/**
 * @notice Attempts to re-enter claim() during native MON transfer (receive()).
 */
contract NativeReentrancyAttacker is IReentrancyCallback {
    LinkVault public vault;
    uint256 public targetId;
    uint8 public v;
    bytes32 public r;
    bytes32 public s;
    bool private _reenterAttempted;
    bool private _reenterSucceeded;

    constructor(address payable _vault) {
        vault = LinkVault(_vault);
    }

    function attackClaim(uint256 depositId, uint8 _v, bytes32 _r, bytes32 _s) external {
        targetId = depositId;
        v = _v;
        r = _r;
        s = _s;
        vault.claim(depositId, address(this), _v, _r, _s);
    }

    // Called when vault sends native MON — attempt reentrancy
    receive() external payable {
        _reenterAttempted = true;
        try vault.claim(targetId, address(this), v, r, s) {
            _reenterSucceeded = true;
        } catch {
            _reenterSucceeded = false;
        }
    }

    // Required by IReentrancyCallback (not used for native, but needed for interface)
    function onReceive() external override {}

    function reenterAttempted() external view returns (bool) {
        return _reenterAttempted;
    }

    function reenterSucceeded() external view returns (bool) {
        return _reenterSucceeded;
    }
}
