// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LinkVault} from "../src/LinkVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/**
 * @title LinkVaultCoverageTest
 * @notice Additional tests targeting uncovered branches to achieve >85% coverage.
 *         Focuses on: ERC20 transfer failures, domain separator fork detection,
 *         refund of non-existent deposits, claim on non-existent deposits,
 *         and edge cases not covered by the main test suite.
 */
contract LinkVaultCoverageTest is Test {
    LinkVault public vault;
    MockERC20 public token;

    address sender = makeAddr("sender");
    address recipient = makeAddr("recipient");
    address attacker = makeAddr("attacker");

    uint256 secretKey = 0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2;
    address claimKey;

    function setUp() public {
        vault = new LinkVault(address(0));
        token = new MockERC20("Test Token", "TST", 18);
        vm.deal(sender, 100 ether);
        token.mint(sender, 1_000_000 * 10 ** 18);
        claimKey = vm.addr(secretKey);
    }

    // -----------------------------------------------------------------
    // Refund: Non-existent deposit
    // -----------------------------------------------------------------

    function test_RevertRefundNonexistent() public {
        vm.expectRevert(LinkVault.DepositNotFound.selector);
        vault.refund(999);
    }

    // -----------------------------------------------------------------
    // Claim: ecrecover returns address(0) — malformed signature
    // -----------------------------------------------------------------

    function test_RevertClaimInvalidEcrecoverResult() public {
        // Create a deposit first
        vm.startPrank(sender);
        uint256 id = vault.createLink{value: 1 ether}(
            address(0), 1 ether, claimKey, uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        // Use v=0, r=0, s=0 which ecrecover returns address(0) for
        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, recipient, 0, bytes32(0), bytes32(0));
    }

    // -----------------------------------------------------------------
    // Domain Separator: Chain fork detection
    // -----------------------------------------------------------------

    function test_DomainSeparatorChangesOnFork() public {
        bytes32 ds1 = vault.domainSeparator();

        // Simulate a chain fork by changing the chain ID
        vm.chainId(99999);

        bytes32 ds2 = vault.domainSeparator();

        // Domain separator should be different after chain ID change
        assertTrue(ds1 != ds2, "Domain separator should change on fork");
    }

    function test_DomainSeparatorConsistentOnSameChain() public {
        bytes32 ds1 = vault.domainSeparator();
        bytes32 ds2 = vault.domainSeparator();
        assertEq(ds1, ds2);
    }

    // -----------------------------------------------------------------
    // GetDeposit: Returns empty for non-existent
    // -----------------------------------------------------------------

    function test_GetDepositNonexistent() public {
        LinkVault.Deposit memory d = vault.getDeposit(999);
        assertEq(d.sender, address(0));
        assertEq(d.amount, 0);
        assertFalse(d.claimed);
    }

    // -----------------------------------------------------------------
    // ERC20: Transfer failure in createLink
    // -----------------------------------------------------------------

    function test_RevertCreateERC20TransferFailed() public {
        // Don't approve — OZ ERC20 reverts with ERC20InsufficientAllowance
        // instead of returning false. The LinkVault uses IERC20 interface
        // which returns bool, but standard OZ tokens revert on failure.
        vm.startPrank(sender);
        // OZ v5 reverts with a custom error selector
        vm.expectRevert();
        vault.createLink(
            address(token), 100 * 10 ** 18, claimKey, uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();
    }

    // -----------------------------------------------------------------
    // ERC20: Claim with ERC20 transfer
    // -----------------------------------------------------------------

    function test_ClaimERC20EmitsEvent() public {
        uint256 amount = 50 * 10 ** 18;

        vm.startPrank(sender);
        token.approve(address(vault), amount);
        uint256 id = vault.createLink(
            address(token), amount, claimKey, uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        bytes32 digest = vault.computeClaimDigest(id, recipient);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(secretKey, digest);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.LinkClaimed(id, recipient, address(token), amount);

        vault.claim(id, recipient, v, r, s);
    }

    // -----------------------------------------------------------------
    // ERC20: Refund after expiry
    // -----------------------------------------------------------------

    function test_RefundERC20EmitsEvent() public {
        uint256 amount = 75 * 10 ** 18;

        vm.startPrank(sender);
        token.approve(address(vault), amount);
        uint256 id = vault.createLink(
            address(token), amount, claimKey, uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours + 1);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.LinkRefunded(id, sender, address(token), amount);

        vm.prank(sender);
        vault.refund(id);
    }

    // -----------------------------------------------------------------
    // Multiple sequential operations
    // -----------------------------------------------------------------

    function test_CreateClaimRefundLifecycle() public {
        // Create deposit 1 — will be claimed
        vm.startPrank(sender);
        uint256 id1 = vault.createLink{value: 0.5 ether}(
            address(0), 0.5 ether, claimKey, uint40(block.timestamp + 2 hours)
        );
        vm.stopPrank();

        // Create deposit 2 — will be refunded
        vm.startPrank(sender);
        uint256 id2 = vault.createLink{value: 0.3 ether}(
            address(0), 0.3 ether, claimKey, uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        // Claim deposit 1
        {
            bytes32 digest = vault.computeClaimDigest(id1, recipient);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(secretKey, digest);
            vault.claim(id1, recipient, v, r, s);
        }

        // Warp past expiry for deposit 2
        vm.warp(block.timestamp + 1 hours + 1);

        // Refund deposit 2
        vm.prank(sender);
        vault.refund(id2);

        // Verify final state
        assertTrue(vault.getDeposit(id1).claimed);
        assertTrue(vault.getDeposit(id2).claimed);
        assertEq(recipient.balance, 0.5 ether);
        // Sender got back 0.3 from refund, spent 0.8 total, so has 99.5
        assertEq(sender.balance, 99.5 ether);
    }

    // -----------------------------------------------------------------
    // ComputeClaimDigest: Different deposits produce different digests
    // -----------------------------------------------------------------

    function test_ComputeClaimDigestDiffersByDeposit() public {
        vm.startPrank(sender);
        vault.createLink{value: 0.1 ether}(
            address(0), 0.1 ether, claimKey, uint40(block.timestamp + 1 hours)
        );
        vault.createLink{value: 0.1 ether}(
            address(0), 0.1 ether, claimKey, uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        bytes32 digest1 = vault.computeClaimDigest(1, recipient);
        bytes32 digest2 = vault.computeClaimDigest(2, recipient);
        assertTrue(digest1 != digest2);
    }

    function test_ComputeClaimDigestDiffersByRecipient() public {
        bytes32 digest1 = vault.computeClaimDigest(1, recipient);
        bytes32 digest2 = vault.computeClaimDigest(1, attacker);
        assertTrue(digest1 != digest2);
    }

    // -----------------------------------------------------------------
    // NextDepositId starts at 1
    // -----------------------------------------------------------------

    function test_InitialNextDepositId() public {
        assertEq(vault.nextDepositId(), 1);
    }

    // -----------------------------------------------------------------
    // Native value mismatch — sending too much
    // -----------------------------------------------------------------

    function test_RevertCreateNativeValueTooMuch() public {
        vm.expectRevert(LinkVault.NativeValueMismatch.selector);
        vm.prank(sender);
        vault.createLink{value: 2 ether}(
            address(0), 1 ether, claimKey, uint40(block.timestamp + 1 hours)
        );
    }

    // -----------------------------------------------------------------
    // Fuzz: ERC20 create and claim
    // -----------------------------------------------------------------

    function testFuzz_CreateAndClaimERC20(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000 * 10 ** 18);
        token.mint(sender, amount);

        vm.startPrank(sender);
        token.approve(address(vault), amount);
        uint256 id = vault.createLink(
            address(token), amount, claimKey, uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        bytes32 digest = vault.computeClaimDigest(id, recipient);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(secretKey, digest);
        vault.claim(id, recipient, v, r, s);

        assertEq(token.balanceOf(recipient), amount);
    }

    // -----------------------------------------------------------------
    // Fuzz: Expiry boundary — create at exact timestamp
    // -----------------------------------------------------------------

    function testFuzz_ExpiryBoundary(uint40 expiryOffset) public {
        expiryOffset = uint40(bound(uint256(expiryOffset), 1, 365 days));

        vm.prank(sender);
        uint256 id = vault.createLink{value: 0.1 ether}(
            address(0), 0.1 ether, claimKey, uint40(block.timestamp + expiryOffset)
        );

        // Warp to just before expiry — claim should succeed
        vm.warp(block.timestamp + expiryOffset - 1);
        bytes32 digest = vault.computeClaimDigest(id, recipient);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(secretKey, digest);
        vault.claim(id, recipient, v, r, s);

        assertTrue(vault.getDeposit(id).claimed);
    }
}
