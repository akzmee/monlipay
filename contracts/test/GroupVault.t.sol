// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {GroupVault} from "../src/GroupVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";

contract GroupReceiver {
    GroupVault public vault;
    uint256 public packet;
    bool public reject = true;
    bool public reentryBlocked;

    constructor(GroupVault v) {
        vault = v;
    }

    function collect(uint256 id, address to) external {
        packet = id;
        vault.claimShare(id, to);
    }

    function accept() external {
        reject = false;
    }

    receive() external payable {
        require(!reject);
        try vault.claimShare(packet, address(this)) {}
        catch {
            reentryBlocked = true;
        }
    }
}

contract GroupVaultTest is Test {
    GroupVault vault;
    MockERC20 token;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");

    function setUp() public {
        vault = new GroupVault();
        token = new MockERC20("Demo Dollar", "USD", 6);
        vm.deal(address(this), 1000 ether);
    }
    receive() external payable {}

    function create(uint256 total, uint16 slots) internal returns (uint256) {
        return vault.createOpenPacket{value: total}(
            address(0), total, slots, uint40(block.timestamp + 1 days), "Community rewards"
        );
    }

    function test_TenWalletsReceiveExactlyTenDollars() public {
        token.mint(address(this), 100_000_000);
        token.approve(address(vault), 100_000_000);
        uint256 id = vault.createOpenPacket(
            address(token), 100_000_000, 10, uint40(block.timestamp + 1 days), "Participant rewards"
        );
        for (uint256 i; i < 10; ++i) {
            address recipient = address(uint160(1000 + i));
            vm.prank(recipient);
            vault.claimShare(id, recipient);
            assertEq(token.balanceOf(recipient), 10_000_000);
            assertEq(vault.getPacket(id).remaining, (9 - i) * 10_000_000);
            assertEq(vault.getPacket(id).settled, i + 1);
        }
        vm.prank(alice);
        vm.expectRevert(GroupVault.Unavailable.selector);
        vault.claimShare(id, alice);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_ClaimCannotRepeatByChangingDestination() public {
        uint256 id = create(1 ether, 2);
        vm.prank(alice);
        vault.claimShare(id, bob);
        vm.prank(alice);
        vm.expectRevert(GroupVault.AlreadyClaimed.selector);
        vault.claimShare(id, charlie);
        (bool requested, uint64 sequence, uint256 amount, bool withdrawn) = vault.claims(id, alice);
        assertTrue(requested);
        assertTrue(withdrawn);
        assertEq(sequence, 0);
        assertEq(amount, 0.5 ether);
        vm.prank(bob);
        vault.claimShare(id, bob);
        assertEq(bob.balance, 1 ether);
        uint256 next = create(1 ether, 1);
        vm.prank(alice);
        vault.claimShare(next, alice);
        assertEq(alice.balance, 1 ether);
    }

    function test_SelectedWalletsRetainEligibilityAndQuota() public {
        address[] memory list = new address[](3);
        list[0] = alice;
        list[1] = bob;
        list[2] = charlie;
        uint256 id =
            vault.createPacket{value: 1 ether}(address(0), 1 ether, 2, uint40(block.timestamp + 1 days), "Team", list);
        assertFalse(vault.openPackets(id));
        vm.expectRevert(GroupVault.NotEligible.selector);
        vault.claimShare(id, address(this));
        vm.prank(alice);
        vault.claimShare(id, alice);
        vm.prank(bob);
        vault.claimShare(id, bob);
        vm.prank(charlie);
        vm.expectRevert(GroupVault.Unavailable.selector);
        vault.claimShare(id, charlie);
    }

    function test_UnevenPoolRejectedWithoutMovingFunds() public {
        vm.expectRevert(GroupVault.UnevenPool.selector);
        create(100_000_000, 3);
        assertEq(vault.nextPacketId(), 1);
        assertEq(address(vault).balance, 0);
    }

    function test_ExpiryBoundaryAndPartialRefund() public {
        uint256 id = create(1 ether, 10);
        vm.prank(alice);
        vault.claimShare(id, alice);
        vm.expectRevert(GroupVault.Unavailable.selector);
        vault.refund(id, address(this));
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        vm.expectRevert(GroupVault.Unavailable.selector);
        vault.claimShare(id, bob);
        vm.prank(bob);
        vm.expectRevert(GroupVault.Unauthorized.selector);
        vault.refund(id, bob);
        uint256 before = address(this).balance;
        vault.refund(id, address(this));
        assertEq(address(this).balance - before, 0.9 ether);
        assertEq(alice.balance, 0.1 ether);
        assertTrue(vault.getPacket(id).closed);
        assertEq(address(vault).balance, 0);
        vm.expectRevert(GroupVault.Unavailable.selector);
        vault.refund(id, address(this));
    }

    function test_FailedTransferKeepsSlotAvailableAndCanRetry() public {
        GroupReceiver receiver = new GroupReceiver(vault);
        uint256 id = create(1 ether, 2);
        vm.expectRevert(GroupVault.TransferFailed.selector);
        receiver.collect(id, address(receiver));
        assertFalse(vault.claimed(id, address(receiver)));
        assertEq(vault.getPacket(id).requested, 0);
        assertEq(vault.getPacket(id).remaining, 1 ether);
        receiver.collect(id, alice);
        assertEq(alice.balance, 0.5 ether);
        vm.prank(bob);
        vault.claimShare(id, bob);
        assertEq(address(vault).balance, 0);
    }

    function test_ReentryBlockedBeforeOtherSlotCanBeConsumed() public {
        GroupReceiver receiver = new GroupReceiver(vault);
        receiver.accept();
        uint256 id = create(1 ether, 2);
        receiver.collect(id, address(receiver));
        assertTrue(receiver.reentryBlocked());
        assertEq(address(receiver).balance, 0.5 ether);
        assertEq(vault.getPacket(id).requested, 1);
    }

    function test_FailedRefundCanRetryAnotherDestination() public {
        uint256 id = create(1 ether, 2);
        vm.warp(block.timestamp + 1 days);
        GroupReceiver receiver = new GroupReceiver(vault);
        vm.expectRevert(GroupVault.TransferFailed.selector);
        vault.refund(id, address(receiver));
        assertFalse(vault.getPacket(id).closed);
        assertEq(vault.getPacket(id).remaining, 1 ether);
        vault.refund(id, bob);
        assertEq(bob.balance, 1 ether);
    }

    function test_RejectsWrongValueZeroDestinationAndUnknownPacket() public {
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.createOpenPacket{value: 1}(address(0), 2, 2, uint40(block.timestamp + 1 days), "Wrong value");
        uint256 id = create(1 ether, 2);
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.claimShare(id, address(0));
        assertEq(vault.getPacket(id).requested, 0);
        vm.expectRevert(GroupVault.Unavailable.selector);
        vault.claimShare(99, alice);
        (bool requested,, uint256 amount,) = vault.claims(99, alice);
        assertFalse(requested);
        assertEq(amount, 0);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.refund(id, address(0));
    }

    function test_ValidatesRecipientQuotaTitleAndExpiry() public {
        vm.expectRevert(GroupVault.InvalidInput.selector);
        create(1 ether, 0);
        vm.expectRevert(GroupVault.InvalidInput.selector);
        create(1 ether, 101);
        vm.expectRevert(GroupVault.InvalidInput.selector);
        create(1, 2);
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.createOpenPacket{value: 1}(address(0), 1, 1, uint40(block.timestamp), "Expired");
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.createOpenPacket{value: 1}(address(0), 1, 1, uint40(block.timestamp + 31 days), "Too long");
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.createOpenPacket{value: 1}(address(0), 1, 1, uint40(block.timestamp + 1 days), "");
    }

    function test_SelectedListCannotBeEmptyDuplicateOrZero() public {
        address[] memory list = new address[](2);
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.createPacket{value: 2}(address(0), 2, 2, uint40(block.timestamp + 1 days), "Zero", list);
        list[0] = alice;
        list[1] = alice;
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.createPacket{value: 2}(address(0), 2, 2, uint40(block.timestamp + 1 days), "Duplicate", list);
        vm.expectRevert(GroupVault.InvalidInput.selector);
        vault.createPacket{value: 2}(address(0), 2, 2, uint40(block.timestamp + 1 days), "Empty", new address[](0));
    }

    function test_FeeOnTransferRejectedAtomically() public {
        MockFeeOnTransferERC20 taxed = new MockFeeOnTransferERC20("Tax", "TAX", 6, 100);
        taxed.mint(address(this), 100_000_000);
        taxed.approve(address(vault), 100_000_000);
        vm.expectRevert(GroupVault.UnsupportedToken.selector);
        vault.createOpenPacket(address(taxed), 100_000_000, 10, uint40(block.timestamp + 1 days), "Tax");
        assertEq(taxed.balanceOf(address(this)), 100_000_000);
        assertEq(vault.nextPacketId(), 1);
    }

    function test_PacketsAndAssetsHaveIndependentBalances() public {
        uint256 nativeId = create(1 ether, 2);
        token.mint(address(this), 100_000_000);
        token.approve(address(vault), 100_000_000);
        uint256 id = vault.createOpenPacket(address(token), 100_000_000, 10, uint40(block.timestamp + 1 days), "Tokens");
        vm.prank(alice);
        vault.claimShare(id, alice);
        assertEq(vault.getPacket(nativeId).remaining, 1 ether);
        vm.warp(block.timestamp + 1 days);
        vault.refund(id, bob);
        assertEq(token.balanceOf(bob), 90_000_000);
        assertEq(address(vault).balance, 1 ether);
        vault.refund(nativeId, address(this));
        assertEq(address(vault).balance, 0);
    }

    function test_HistoryPagesAndCompletedRecordsPersist() public {
        uint256 id = create(1 ether, 1);
        vm.prank(alice);
        vault.claimShare(id, alice);
        create(1 ether, 1);
        create(1 ether, 1);
        assertEq(vault.getCreatedPackets(address(this), 1, 1)[0], 2);
        assertEq(vault.getCreatedPackets(address(this), 2, 10)[0], id);
        assertEq(vault.getPacket(id).requested, 1);
        assertEq(vault.getPacket(id).remaining, 0);
        assertEq(vault.getCreatedPackets(address(this), 3, 10).length, 0);
    }

    function testFuzz_ExactSharesConservePool(uint8 rawSlots, uint128 rawShare) public {
        uint16 slots = uint16(bound(rawSlots, 1, 100));
        uint256 share = bound(rawShare, 1, 1 ether);
        uint256 total = share * slots;
        uint256 id = create(total, slots);
        for (uint256 i; i < slots; ++i) {
            address recipient = address(uint160(1000 + i));
            uint256 beforeBalance = recipient.balance;
            vm.prank(recipient);
            vault.claimShare(id, recipient);
            assertEq(recipient.balance - beforeBalance, share);
        }
        assertEq(vault.getPacket(id).remaining, 0);
        assertEq(address(vault).balance, 0);
    }
}
