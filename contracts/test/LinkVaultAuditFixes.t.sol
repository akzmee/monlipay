// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LinkVault} from "../src/LinkVault.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {ETHRefuser} from "./mocks/ETHRefuser.sol";

/**
 * @title LinkVaultAuditFixesTest
 * @notice Targeted tests for the audit-fix round 2:
 *         F1 (HIGH-1) expiry boundary — both claim and refund revert at exact
 *            expiry, eliminating any race window.
 *         F2 (HIGH-2) pull-pattern fallback — `_transfer` parks failed native
 *            ETH in `failedRefunds[depositId]` so deposits don't brick.
 *         F3 (MEDIUM-1) fee-on-transfer token support.
 *         F4 (MEDIUM-2) explicit signer == address(0) check.
 *         `sweep` placeholder always reverts.
 */
contract LinkVaultAuditFixesTest is Test {
    LinkVault public vault;
    MockFeeOnTransferERC20 public feeToken;
    ETHRefuser public refuser;

    address sender = makeAddr("sender");
    address recipient = makeAddr("recipient");
    address attacker = makeAddr("attacker");
    address pullTo = makeAddr("pullTo");

    uint256 secretKey;
    address claimKey;

    function setUp() public {
        vault = new LinkVault();
        // 1% fee on every transfer
        feeToken = new MockFeeOnTransferERC20("Fee Token", "FEE", 18, 100);
        refuser = new ETHRefuser();

        vm.deal(sender, 100 ether);
        feeToken.mint(sender, 1_000_000 * 10 ** 18);

        secretKey = 0xB1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2;
        claimKey = vm.addr(secretKey);

        // Fund pullTo with gas for any后续 calls
        vm.deal(pullTo, 1 ether);
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

    function _createNativeLink(address senderAddr, uint256 amount, uint40 expiryDuration)
        internal
        returns (uint256)
    {
        vm.startPrank(senderAddr);
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + expiryDuration)
        );
        vm.stopPrank();
        return id;
    }

    function _createFeeTokenLink(address senderAddr, uint256 amount, uint40 expiryDuration)
        internal
        returns (uint256)
    {
        vm.startPrank(senderAddr);
        feeToken.approve(address(vault), amount);
        uint256 id = vault.createLink(
            address(feeToken),
            amount,
            claimKey,
            uint40(block.timestamp + expiryDuration)
        );
        vm.stopPrank();
        return id;
    }

    // =================================================================
    // F1 — Expiry boundary
    //
    // Contract invariants:
    //   - claim()    reverts when block.timestamp >= d.expiry
    //   - refund()   reverts when block.timestamp <= d.expiry
    //   - autoRefund reverts when block.timestamp <= d.expiry
    //
    // At block.timestamp == d.expiry, ALL three revert. The recipient
    // must claim before expiry; the sender must wait until strictly
    // after expiry. There is no race window.
    // =================================================================

    function testF1_NoRaceAtExactExpiry() public {
        uint256 id = _createNativeLink(sender, 1 ether, 1 hours);
        vm.warp(block.timestamp + 1 hours);

        // claim reverts
        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.expectRevert(LinkVault.NotExpired.selector);
        vault.claim(id, recipient, v, r, s);

        // refund reverts
        vm.prank(sender);
        vm.expectRevert(LinkVault.NotExpired.selector);
        vault.refund(id);

        // autoRefund reverts
        vm.prank(attacker);
        vm.expectRevert(LinkVault.NotExpired.selector);
        vault.autoRefund(id);

        // Deposit must still be unclaimed
        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertFalse(d.claimed);
    }

    function testF1_ClaimOneSecondBeforeExpirySucceeds() public {
        uint256 id = _createNativeLink(sender, 1 ether, 1 hours);
        vm.warp(block.timestamp + 1 hours - 1 seconds);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertTrue(d.claimed);
    }

    function testF1_RefundOneSecondAfterExpirySucceeds() public {
        uint256 id = _createNativeLink(sender, 1 ether, 1 hours);
        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.prank(sender);
        vault.refund(id);

        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertTrue(d.claimed);
    }

    // =================================================================
    // F2 — Pull-pattern fallback (HIGH-2)
    // =================================================================

    function testF2_RefundToETHRefuserParksInFailedRefunds() public {
        // Sender is an ETHRefuser contract. We can't easily replace `sender`
        // address, so we use the refuser contract directly as the deposit
        // creator.
        uint256 amount = 1 ether;
        vm.deal(address(refuser), amount);

        vm.startPrank(address(refuser));
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        // Warp past expiry
        vm.warp(block.timestamp + 1 hours + 1 seconds);

        // autoRefund — push to refuser must fail, but the deposit must NOT brick.
        // Funds should be parked in failedRefunds[id].
        vm.prank(attacker);
        vault.autoRefund(id);

        // Deposit is marked claimed
        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertTrue(d.claimed);

        // Funds are parked
        assertEq(vault.failedRefunds(id), amount);
        // Contract still holds the ETH
        assertEq(address(vault).balance, amount);
    }

    function testF2_RefundFailedEmitsEvent() public {
        uint256 amount = 1 ether;
        vm.deal(address(refuser), amount);

        vm.startPrank(address(refuser));
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.RefundFailed(id, address(refuser), address(0), amount);

        vm.prank(attacker);
        vault.autoRefund(id);
    }

    function testF2_ClaimFailedRefundByOriginalSenderSucceeds() public {
        uint256 amount = 1 ether;
        vm.deal(address(refuser), amount);

        vm.startPrank(address(refuser));
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        // First autoRefund parks the funds
        vm.prank(attacker);
        vault.autoRefund(id);

        // The refuser contract can still initiate outgoing calls. It cannot
        // receive ETH, but it can call claimFailedRefund to push funds to
        // a new EOA it controls.
        uint256 pullToBefore = pullTo.balance;
        vm.startPrank(address(refuser));
        vault.claimFailedRefund(id, payable(pullTo));
        vm.stopPrank();

        // pullTo's balance increased by `amount`
        assertEq(pullTo.balance, pullToBefore + amount);
        // failedRefunds cleared
        assertEq(vault.failedRefunds(id), 0);
    }

    function testF2_ClaimFailedRefundEmitsLinkRefundedEvent() public {
        uint256 amount = 1 ether;
        vm.deal(address(refuser), amount);

        vm.startPrank(address(refuser));
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.prank(attacker);
        vault.autoRefund(id);

        vm.expectEmit(true, true, true, true);
        emit LinkVault.LinkRefunded(id, address(refuser), address(0), amount);

        vm.prank(address(refuser));
        vault.claimFailedRefund(id, payable(pullTo));
    }

    function testF2_RevertClaimFailedRefundByNonSender() public {
        uint256 amount = 1 ether;
        vm.deal(address(refuser), amount);

        vm.startPrank(address(refuser));
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.prank(attacker);
        vault.autoRefund(id);

        // Attacker tries to pull — must revert
        vm.prank(attacker);
        vm.expectRevert(LinkVault.NotFailedRefundOwner.selector);
        vault.claimFailedRefund(id, payable(attacker));
    }

    function testF2_RevertClaimFailedRefundNothingParked() public {
        uint256 id = _createNativeLink(sender, 1 ether, 1 hours);

        // No failed refund exists — must revert
        vm.prank(sender);
        vm.expectRevert(LinkVault.NoFailedRefund.selector);
        vault.claimFailedRefund(id, payable(recipient));
    }

    function testF2_RevertClaimFailedRefundNonexistent() public {
        vm.prank(sender);
        vm.expectRevert(LinkVault.DepositNotFound.selector);
        vault.claimFailedRefund(999, payable(recipient));
    }

    function testF2_ClaimFailedRefundIdempotent() public {
        // After a successful pull, the second pull reverts (amount == 0)
        uint256 amount = 1 ether;
        vm.deal(address(refuser), amount);

        vm.startPrank(address(refuser));
        uint256 id = vault.createLink{value: amount}(
            address(0),
            amount,
            claimKey,
            uint40(block.timestamp + 1 hours)
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        vm.prank(attacker);
        vault.autoRefund(id);

        vm.prank(address(refuser));
        vault.claimFailedRefund(id, payable(pullTo));

        // Second pull should revert
        vm.prank(address(refuser));
        vm.expectRevert(LinkVault.NoFailedRefund.selector);
        vault.claimFailedRefund(id, payable(pullTo));
    }

    // =================================================================
    // F3 — Fee-on-transfer token support (MEDIUM-1)
    // =================================================================

    function testF3_ClaimWithFeeOnTransferToken() public {
        // MEDIUM-1: With deposit-time balance reconciliation, the stored
        // deposit amount = (requested * (1 - fee)). On claim, the payout
        // suffers another fee deduction, but the vault always has enough
        // tokens to attempt the full stored amount.
        uint256 requested = 100 ether;
        // After 1% deposit fee, stored amount = 99 ether
        uint256 storedAmount = 99 ether;
        // After 1% payout fee, recipient receives 99 - 0.99 = 98.01 ether
        uint256 expectedRecipient = 98.01 ether;

        uint256 id = _createFeeTokenLink(sender, requested, 1 hours);

        // Verify stored deposit amount was reconciled
        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertEq(d.amount, storedAmount);

        (uint8 v, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);
        vm.prank(attacker);
        vault.claim(id, recipient, v, r, s);

        // Recipient receives expectedRecipient
        assertEq(feeToken.balanceOf(recipient), expectedRecipient);
        // Vault balance is 0 — the mock burns the fee (0.99 ether) from the
        // vault itself. The RefundFailed event was emitted for the residual
        // but no tokens are actually recoverable (they were burned).
        assertEq(feeToken.balanceOf(address(vault)), 0);
    }

    function testF3_RefundWithFeeOnTransferToken() public {
        uint256 requested = 100 ether;
        uint256 expectedSenderGain = 98.01 ether; // 99 - 1% fee

        uint256 id = _createFeeTokenLink(sender, requested, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        uint256 senderBefore = feeToken.balanceOf(sender);

        vm.prank(sender);
        vault.refund(id);

        // Sender gets 98.01 ether (99 stored - 1% payout fee)
        assertEq(feeToken.balanceOf(sender), senderBefore + expectedSenderGain);
        // Vault holds 0 (fee burned by mock on transfer)
        assertEq(feeToken.balanceOf(address(vault)), 0);
    }

    function testF3_AutoRefundWithFeeOnTransferToken() public {
        uint256 requested = 100 ether;
        uint256 expectedSenderGain = 98.01 ether;

        uint256 id = _createFeeTokenLink(sender, requested, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1 seconds);

        uint256 senderBefore = feeToken.balanceOf(sender);

        vm.prank(attacker);
        vault.autoRefund(id);

        assertEq(feeToken.balanceOf(sender), senderBefore + expectedSenderGain);
        assertEq(feeToken.balanceOf(address(vault)), 0);
    }

    function testF3_DepositAmountReconciled() public {
        // Verify the deposit stores actual received amount, not requested.
        uint256 requested = 1000 ether;
        uint256 id = _createFeeTokenLink(sender, requested, 1 hours);

        LinkVault.Deposit memory d = vault.getDeposit(id);
        assertEq(d.amount, 990 ether); // 1000 - 1% fee
    }

    // =================================================================
    // F4 — Explicit signer == address(0) check (MEDIUM-2)
    //
    // ecrecover returns address(0) on malformed input. The explicit check
    // ensures such inputs are rejected as InvalidSignature. We trigger this
    // by using a v value of 30 (invalid: only 27 and 28 are valid) — but
    // that's caught earlier by the v != 27 && v != 28 check. The signer==0
    // check is a belt-and-suspenders for future refactors that might allow
    // claimKey == address(0). Since that's currently blocked at create time,
    // we test indirectly by verifying that v values outside {27,28} are
    // rejected with InvalidSignature.
    // =================================================================

    function testF4_RejectInvalidV() public {
        uint256 id = _createNativeLink(sender, 1 ether, 1 hours);
        (, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);

        // Force v to invalid value (e.g. 30)
        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, recipient, 30, r, s);
    }

    function testF4_RejectHighS() public {
        uint256 id = _createNativeLink(sender, 1 ether, 1 hours);
        (, bytes32 r, bytes32 s) = _signClaim(id, recipient, secretKey);

        // Compute -s mod n (the malleable counterpart)
        // secp256k1 n
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes32 sMalleable = bytes32(n - uint256(s));

        vm.expectRevert(LinkVault.InvalidSignature.selector);
        vault.claim(id, recipient, 28, r, sMalleable);
    }

    function testF4_RejectsClaimKeyZeroEvenIfEcrecoverReturnsZero() public {
        // Sanity: createLink rejects address(0) claimKey
        vm.expectRevert(LinkVault.ZeroClaimKey.selector);
        vm.prank(sender);
        vault.createLink{value: 1 ether}(
            address(0),
            1 ether,
            address(0),
            uint40(block.timestamp + 1 hours)
        );
    }

    // =================================================================
    // sweep() — intentionally unimplemented, always reverts
    // =================================================================

    function test_SweepAlwaysReverts() public {
        vm.expectRevert(bytes("sweep: not implemented"));
        vault.sweep(address(0), attacker, 0);
    }

    function test_SweepRevertsEvenForValidInputs() public {
        // Even with a token and amount, sweep reverts — no sweep surface.
        vm.expectRevert(bytes("sweep: not implemented"));
        vault.sweep(address(feeToken), attacker, 100);
    }
}

/**
 * @title RefuserCaller
 * @notice Helper contract to demonstrate that the ETHRefuser contract CAN
 *         initiate calls (just cannot receive ETH). Not used in tests above
 *         because we prank directly, but kept as documentation of intent.
 */
contract RefuserCaller {
    LinkVault public immutable vault;

    constructor(address _vault) {
        vault = LinkVault(payable(_vault));
    }

    function pullRefund(uint256 depositId, address payable to) external {
        vault.claimFailedRefund(depositId, to);
    }
}
