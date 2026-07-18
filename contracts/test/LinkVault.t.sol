// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LinkVault} from "../src/LinkVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/**
 * @title LinkVaultTest
 * @notice Comprehensive tests for LinkVault: create, claim, refund,
 *         double-claim, expiry, signature verification, and edge cases.
 */
contract LinkVaultTest is Test {
    LinkVault public vault;
    MockERC20 public token;

    address sender = makeAddr("sender");
    address recipient = makeAddr("recipient");
    address attacker = makeAddr("attacker");

    // Ephemeral keypair for claim testing
    uint256 secretKey;
    address claimKey;

    function setUp() public {
        vault = new LinkVault(address(0));
        token = new MockERC20("Test Token", "TST", 18);

        // Fund sender with native MON and ERC-20
        vm.deal(sender, 100 ether);
        token.mint(sender, 1_000_000 * 10 ** 18);

        // Generate ephemeral keypair
        secretKey = 0xA1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2;
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

    function _createERC20Link(uint256 amount, uint40 expiryDuration)
        internal
        returns (uint256)
    {
        vm.startPrank(sender);
        token.approve(address(vault), amount);
        uint256 id = vault.createLink(
            address(token),
            amount,
            claimKey,
            uint40(block.timestamp + expiryDuration)
        );
        vm.stopPrank();
        return id;
    }

    // -----------------------------------------------------------------
    // Create: Native MON
    // -----------------------------------------------------------------

    function test_CreateNativeLink() public {
        uint256 amount = 1 ether;
        uint40 expiry = uint40(block.timestamp + 1 hours);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.LinkCreated(
            1, sender, address(0), amount, claimKey, expiry
        );

        vm.prank(sender);
        uint256 id = vault.createLink{value: amount}(
            address(0), amount, claimKey, expiry
        );

        assertEq(id, 1);
        assertEq(vault.nextDepositId(), 2);

        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertEq(d.sender, sender);
        assertEq(d.token, address(0));
        assertEq(d.amount, amount);
        assertEq(d.claimKey, claimKey);
        assertEq(d.expiry, expiry);
        assertFalse(d.claimed);
    }

    function test_CreateNativeLinkIncrementsId() public {
        uint256 id1 = _createNativeLink(0.5 ether, 1 hours);
        uint256 id2 = _createNativeLink(0.5 ether, 1 hours);
        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_RevertCreateNativeValueMismatch() public {
        vm.expectRevert(LinkVault.NativeValueMismatch.selector);
        vm.prank(sender);
        vault.createLink{value: 0.5 ether}(address(0), 1 ether, claimKey, uint40(block.timestamp + 1 hours));
    }

    // -----------------------------------------------------------------
    // Create: ERC-20
    // -----------------------------------------------------------------

    function test_CreateERC20Link() public {
        uint256 amount = 100 * 10 ** 18;
        uint40 expiry = uint40(block.timestamp + 1 hours);

        vm.startPrank(sender);
        token.approve(address(vault), amount);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.LinkCreated(
            1, sender, address(token), amount, claimKey, expiry
        );

        uint256 id = vault.createLink(address(token), amount, claimKey, expiry);
        vm.stopPrank();

        assertEq(id, 1);

        // Vault should hold the tokens
        assertEq(token.balanceOf(address(vault)), amount);
    }

    function test_RevertCreateERC20WithValueSent() public {
        vm.startPrank(sender);
        token.approve(address(vault), 100);

        vm.expectRevert(LinkVault.NonNativeValueSent.selector);
        vault.createLink{value: 0.1 ether}(
            address(token), 100, claimKey, uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();
    }

    // -----------------------------------------------------------------
    // Create: Validation
    // -----------------------------------------------------------------

    function test_RevertZeroAmount() public {
        vm.expectRevert(LinkVault.ZeroAmount.selector);
        vm.prank(sender);
        vault.createLink{value: 0}(address(0), 0, claimKey, uint40(block.timestamp + 1 hours));
    }

    function test_RevertZeroClaimKey() public {
        vm.expectRevert(LinkVault.ZeroClaimKey.selector);
        vm.prank(sender);
        vault.createLink{value: 1 ether}(address(0), 1 ether, address(0), uint40(block.timestamp + 1 hours));
    }

    function test_RevertInvalidExpiry() public {
        vm.expectRevert(LinkVault.InvalidExpiry.selector);
        vm.prank(sender);
        vault.createLink{value: 1 ether}(address(0), 1 ether, claimKey, uint40(block.timestamp));
    }

    function test_RevertExpiryInPast() public {
        vm.expectRevert(LinkVault.InvalidExpiry.selector);
        vm.prank(sender);
        vault.createLink{value: 1 ether}(address(0), 1 ether, claimKey, uint40(block.timestamp - 1));
    }

    // -----------------------------------------------------------------
    // Claim: Native MON
    // -----------------------------------------------------------------

    function test_ClaimNative() public {
        uint256 amount = 1 ether;
        uint256 id = _createNativeLink(amount, 1 hours);

        (uint8 v, bytes32 r, bytes32 s) =
            _signClaim(id, recipient, secretKey);

        uint256 recipientBefore = recipient.balance;
        uint256 vaultBefore = address(vault).balance;

        vm.prank(attacker); // anyone can submit the claim tx
        vault.claim(id, recipient, v, r, s);

        assertEq(recipient.balance, recipientBefore + amount);
        assertEq(address(vault).balance, vaultBefore - amount);

        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertTrue(d.claimed);
    }

    function test_ClaimERC20() public {
        uint256 amount = 100 * 10 ** 18;
        uint256 id = _createERC20Link(amount, 1 hours);

        (uint8 v, bytes32 r, bytes32 s) =
            _signClaim(id, recipient, secretKey);

        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(address(vault)), 0);

        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertTrue(d.claimed);
    }

    function test_ClaimEmitsEvent() public {
        uint256 amount = 1 ether;
        uint256 id = _createNativeLink(amount, 1 hours);

        (uint8 v, bytes32 r, bytes32 s) =
            _signClaim(id, recipient, secretKey);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.LinkClaimed(id, recipient, address(0), amount);

        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);
    }

    // -----------------------------------------------------------------
    // Claim: Multiple deposits with same secret key
    // -----------------------------------------------------------------

    function test_ClaimMultipleDepositsSameKey() public {
        // Create 3 deposits with the same claimKey
        uint256 id1 = _createNativeLink(0.3 ether, 2 hours);
        uint256 id2 = _createNativeLink(0.3 ether, 2 hours);
        uint256 id3 = _createNativeLink(0.4 ether, 2 hours);

        // Claim each individually
        {
            (uint8 v, bytes32 r, bytes32 s) = _signClaim(id1, recipient, secretKey);
            vm.prank(attacker);
            vault.claim(id1, recipient, v, r, s);
        }
        {
            (uint8 v, bytes32 r, bytes32 s) = _signClaim(id2, recipient, secretKey);
            vm.prank(attacker);
            vault.claim(id2, recipient, v, r, s);
        }
        {
            (uint8 v, bytes32 r, bytes32 s) = _signClaim(id3, recipient, secretKey);
            vm.prank(attacker);
            vault.claim(id3, recipient, v, r, s);
        }

        assertEq(recipient.balance, 1 ether);
    }

    // -----------------------------------------------------------------
    // Claim: Failure cases
    // -----------------------------------------------------------------

    function test_RevertClaimNonexistent() public {
        (uint8 v, bytes32 r, bytes32 s) = _signClaim(999, recipient, secretKey);
        vm.expectRevert(LinkVault.DepositNotFound.selector);
        vault.claim(999, recipient, v, r, s);
    }

    function test_RevertDoubleClaim() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        vm.expectRevert(LinkVault.AlreadyClaimed.selector);
        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);
    }

    function test_RevertClaimAfterExpiry() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.expectRevert(LinkVault.NotExpired.selector);
        vault.claim(id, recipient, v, r, s);
    }

    function test_RevertClaimWrongSecretKey() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        // Sign with a different private key
        uint256 wrongKey = 0xDEAD;
        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, wrongKey);

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, recipient, v, r, s);
    }

    function test_RevertClaimZeroRecipient() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, address(0), secretKey);

        vm.expectRevert(LinkVault.ZeroRecipient.selector);
        vault.claim(id, address(0), v, r, s);
    }

    function test_RevertClaimSignatureReusedForDifferentDeposit() public {
        uint256 id1 = _createNativeLink(0.5 ether, 1 hours);
        uint256 id2 = _createNativeLink(0.5 ether, 1 hours);

        // Sign for id1 but try to claim id2
        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id1, recipient, secretKey);

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id2, recipient, v, r, s);
    }

    function test_RevertClaimSignatureReusedForDifferentRecipient() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        // Sign for recipient but try to claim for attacker
        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, attacker, v, r, s);
    }

    // -----------------------------------------------------------------
    // Refund
    // -----------------------------------------------------------------

    function test_RefundNative() public {
        uint256 amount = 1 ether;
        uint256 id = _createNativeLink(amount, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        uint256 senderBefore = sender.balance;

        vm.prank(sender);
        vault.refund(id);

        assertEq(sender.balance, senderBefore + amount);

        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertTrue(d.claimed);
    }

    function test_RefundERC20() public {
        uint256 amount = 100 * 10 ** 18;
        uint256 id = _createERC20Link(amount, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        uint256 senderBefore = token.balanceOf(sender);

        vm.prank(sender);
        vault.refund(id);

        assertEq(token.balanceOf(sender), senderBefore + amount);
    }

    function test_RefundEmitsEvent() public {
        uint256 amount = 1 ether;
        uint256 id = _createNativeLink(amount, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.LinkRefunded(id, sender, address(0), amount);

        vm.prank(sender);
        vault.refund(id);
    }

    function test_RevertRefundBeforeExpiry() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        vm.expectRevert(LinkVault.NotExpired.selector);
        vm.prank(sender);
        vault.refund(id);
    }

    function test_RevertRefundByNonSender() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.expectRevert(LinkVault.NotSender.selector);
        vm.prank(attacker);
        vault.refund(id);
    }

    function test_RevertRefundAlreadyClaimed() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        // Claim first
        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        // Try refund after expiry
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(LinkVault.AlreadyClaimed.selector);
        vm.prank(sender);
        vault.refund(id);
    }

    // -----------------------------------------------------------------
    // autoRefund: permissionless refund for expired deposits
    // -----------------------------------------------------------------

    function test_AutoRefundNative() public {
        uint256 amount = 1 ether;
        uint256 id = _createNativeLink(amount, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        uint256 senderBefore = sender.balance;

        // Anyone can call autoRefund — here the attacker triggers it
        vm.prank(attacker);
        vault.autoRefund(id);

        // Funds go to the original sender, NOT to attacker
        assertEq(sender.balance, senderBefore + amount);
        assertEq(attacker.balance, 0); // attacker gets nothing

        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertTrue(d.claimed);
    }

    function test_AutoRefundERC20() public {
        uint256 amount = 100 * 10 ** 18;
        uint256 id = _createERC20Link(amount, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        uint256 senderBefore = token.balanceOf(sender);

        vm.prank(attacker);
        vault.autoRefund(id);

        assertEq(token.balanceOf(sender), senderBefore + amount);
        assertEq(token.balanceOf(attacker), 0);
    }

    function test_AutoRefundEmitsEvent() public {
        uint256 amount = 1 ether;
        uint256 id = _createNativeLink(amount, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.LinkRefunded(id, sender, address(0), amount);

        vm.prank(attacker);
        vault.autoRefund(id);
    }

    function test_AutoRefundSenderCanAlsoCall() public {
        uint256 amount = 1 ether;
        uint256 id = _createNativeLink(amount, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        // The sender can also call autoRefund (acts like refund without NotSender check)
        uint256 senderBefore = sender.balance;
        vm.prank(sender);
        vault.autoRefund(id);

        assertEq(sender.balance, senderBefore + amount);
    }

    function test_RevertAutoRefundBeforeExpiry() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        vm.expectRevert(LinkVault.NotExpired.selector);
        vm.prank(attacker);
        vault.autoRefund(id);
    }

    function test_RevertAutoRefundNonexistent() public {
        vm.expectRevert(LinkVault.DepositNotFound.selector);
        vault.autoRefund(999);
    }

    function test_RevertAutoRefundAlreadyClaimed() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        // Claim first
        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        // Try autoRefund after expiry
        vm.warp(block.timestamp + 2 hours);

        vm.expectRevert(LinkVault.AlreadyClaimed.selector);
        vm.prank(attacker);
        vault.autoRefund(id);
    }

    function test_RevertAutoRefundAlreadyRefunded() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        // First autoRefund succeeds
        vm.prank(attacker);
        vault.autoRefund(id);

        // Second call should revert
        vm.expectRevert(LinkVault.AlreadyClaimed.selector);
        vm.prank(attacker);
        vault.autoRefund(id);
    }

    function test_AutoRefundAtExactExpiry() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        vm.warp(block.timestamp + 1 hours);

        // F1 (HIGH-1 fix): autoRefund requires `> expiry` (strictly after).
        // At exactly expiry, only claim() is allowed.
        vm.expectRevert(LinkVault.NotExpired.selector);
        vm.prank(attacker);
        vault.autoRefund(id);
    }

    function test_AutoRefundAfterExpiry() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.prank(attacker);
        vault.autoRefund(id);
        // Should succeed — strictly after expiry
    }

    function test_AutoRefundBatch() public {
        // Anyone can batch-refund multiple expired deposits
        uint256 id1 = _createNativeLink(0.5 ether, 1 hours);
        uint256 id2 = _createNativeLink(0.3 ether, 1 hours);
        uint256 id3 = _createNativeLink(0.2 ether, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        uint256 senderBefore = sender.balance;

        vm.startPrank(attacker);
        vault.autoRefund(id1);
        vault.autoRefund(id2);
        vault.autoRefund(id3);
        vm.stopPrank();

        // Sender recovers all 1 ether
        assertEq(sender.balance, senderBefore + 1 ether);
    }

    function test_AutoRefundDoesNotAffectOtherDeposits() public {
        // autoRefund on one deposit must not affect others with same key
        uint256 id1 = _createNativeLink(0.5 ether, 1 hours);
        uint256 id2 = _createNativeLink(0.5 ether, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.prank(attacker);
        vault.autoRefund(id1);

        // id2 should still be refundable
        LinkVault.Deposit memory d2 = vault.getDeposit(id2);
        assertFalse(d2.claimed);
    }

    // -----------------------------------------------------------------
    // Claim-at-the-edge: exact boundary timing
    // -----------------------------------------------------------------

    function test_ClaimAtExactExpiryFails() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        // Warp to exactly expiry
        vm.warp(block.timestamp + 1 hours);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.expectRevert(LinkVault.NotExpired.selector);
        vault.claim(id, recipient, v, r, s);
    }

    function test_RefundAtExactExpiry() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        // Warp to exactly expiry
        vm.warp(block.timestamp + 1 hours);

        // F1 (HIGH-1 fix): refund requires `> expiry` (strictly after).
        vm.expectRevert(LinkVault.NotExpired.selector);
        vm.prank(sender);
        vault.refund(id);
    }

    function test_RefundAfterExpiry() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.prank(sender);
        vault.refund(id);
        // Should succeed — strictly after expiry
    }

    // -----------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------

    function test_Exists() public {
        assertFalse(vault.exists(1));
        _createNativeLink(1 ether, 1 hours);
        assertTrue(vault.exists(1));
        assertFalse(vault.exists(2));
    }

    function test_DomainSeparator() public {
        bytes32 ds = vault.domainSeparator();
        assertTrue(ds != bytes32(0));
    }

    function test_ComputeClaimDigest() public {
        uint256 id = _createNativeLink(1 ether, 1 hours);
        bytes32 digest = vault.computeClaimDigest(id, recipient);
        assertTrue(digest != bytes32(0));
    }

    // -----------------------------------------------------------------
    // Fuzz tests
    // -----------------------------------------------------------------

    function testFuzz_CreateAndClaimNative(uint256 amount, uint40 expiryDuration) public {
        // Bound: amount between 0.001 and 10 MON, expiry between 1 min and 7 days
        amount = bound(amount, 0.001 ether, 10 ether);
        expiryDuration = uint40(bound(uint256(expiryDuration), 60, 7 days));

        vm.deal(sender, amount);

        vm.prank(sender);
        uint256 id = vault.createLink{value: amount}(
            address(0), amount, claimKey, uint40(block.timestamp + expiryDuration)
        );

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        assertEq(recipient.balance, amount);
    }

    function testFuzz_ClaimWithRandomRecipients(address randomRecipient) public {
        // Exclude zero address, known contracts, precompiles, and
        // addresses with code (can't guarantee they accept ETH).
        vm.assume(randomRecipient != address(0));
        vm.assume(randomRecipient != address(vault));
        vm.assume(randomRecipient != address(token));
        vm.assume(randomRecipient != sender);
        vm.assume(randomRecipient != attacker);
        vm.assume(uint160(randomRecipient) > 10000); // Exclude precompiles
        vm.assume(randomRecipient.code.length == 0); // Only EOAs
        vm.assume(randomRecipient.balance == 0); // Start from clean balance

        uint256 amount = 1 ether;
        vm.deal(sender, amount);

        vm.prank(sender);
        uint256 id = vault.createLink{value: amount}(
            address(0), amount, claimKey, uint40(block.timestamp + 1 hours)
        );

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, randomRecipient, secretKey);
        vm.prank(attacker);
        vault.claim(id, randomRecipient, v, r, s);

        assertEq(randomRecipient.balance, amount);
    }
}
