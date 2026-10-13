// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LuckyVault, ILuckyEntropy} from "../src/LuckyVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";

contract MockLuckyEntropy is ILuckyEntropy {
    uint64 public next = 1;
    uint128 public constant FEE = 0.001 ether;

    function getFeeV2(address, uint32) external pure returns (uint128) {
        return FEE;
    }

    function requestV2(address, bytes32, uint32) external payable returns (uint64) {
        require(msg.value == FEE);
        return next++;
    }

    function fulfill(LuckyVault vault, uint64 sequence, address provider, bytes32 random) external {
        vault._entropyCallback(sequence, provider, random);
    }
}

contract LuckyReceiver {
    LuckyVault public vault;
    bool public refuse = true;

    constructor(LuckyVault v) {
        vault = v;
    }

    receive() external payable {
        require(!refuse);
    }

    function request(uint256 id) external payable {
        vault.requestClaim{value: msg.value}(id, bytes32(uint256(7)));
    }

    function collect(uint256 id, address to) external {
        vault.withdrawShare(id, to);
    }
}

contract ReenteringLuckyReceiver {
    LuckyVault immutable vault;
    uint256 packetId;
    bool public blocked;

    constructor(LuckyVault v) {
        vault = v;
    }

    function request(uint256 id) external payable {
        packetId = id;
        vault.requestClaim{value: msg.value}(id, 0);
    }

    function collect() external {
        vault.withdrawShare(packetId, address(this));
    }

    receive() external payable {
        try vault.withdrawShare(packetId, address(this)) {
            blocked = false;
        }
            catch {
            blocked = true;
        }
    }
}

contract LuckyVaultTest is Test {
    LuckyVault vault;
    MockLuckyEntropy entropy;
    MockERC20 token;
    address provider = makeAddr("provider");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");
    uint256 constant FEE = 0.001 ether;

    function setUp() public {
        entropy = new MockLuckyEntropy();
        vault = new LuckyVault(address(entropy), provider);
        token = new MockERC20("Test Dollar", "USD", 6);
        vm.deal(address(this), 1000 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(charlie, 10 ether);
    }
    receive() external payable {}

    function recipients() internal view returns (address[] memory list) {
        list = new address[](3);
        list[0] = alice;
        list[1] = bob;
        list[2] = charlie;
    }

    function create(uint16 slots, uint256 total) internal returns (uint256) {
        return vault.createPacket{value: total}(
            address(0), total, slots, uint40(block.timestamp + 1 days), "For friends", recipients()
        );
    }

    function request(uint256 id, address user) internal returns (uint64 seq) {
        vm.prank(user);
        vault.requestClaim{value: FEE}(id, keccak256(abi.encode(user)));
        (, seq,,) = vault.claims(id, user);
    }

    function fulfill(uint64 seq, uint256 random) internal {
        entropy.fulfill(vault, seq, provider, bytes32(random));
    }

    function test_OpenPacketFirstTenWalletsReserveExactlyTenSlots() public {
        uint256 id = vault.createOpenPacket{value: 1 ether}(
            address(0), 1 ether, 10, uint40(block.timestamp + 1 days), "For everyone"
        );
        assertTrue(vault.openPackets(id));
        uint64[] memory sequences = new uint64[](10);
        for (uint256 i; i < 10; ++i) {
            address user = address(uint160(1000 + i));
            assertFalse(vault.eligible(id, user));
            vm.deal(user, FEE);
            sequences[i] = request(id, user);
        }
        vm.prank(alice);
        vm.expectRevert(LuckyVault.Unavailable.selector);
        vault.requestClaim{value: FEE}(id, 0);
        assertEq(vault.getPacket(id).requested, 10);
        assertEq(vault.getPacket(id).settled, 0);
        for (uint256 i; i < 10; ++i) {
            fulfill(sequences[9 - i], i * 1297);
            vm.prank(address(uint160(1009 - i)));
            vault.withdrawShare(id, bob);
        }
        assertEq(vault.getPacket(id).remaining, 0);
        assertEq(vault.getPacket(id).settled, 10);
        assertEq(address(vault).balance, 0);
        assertEq(bob.balance, 11 ether);
    }

    function test_OpenPacketCannotRerollOrWithdrawTwice() public {
        uint256 id = vault.createOpenPacket{value: 1 ether}(
            address(0), 1 ether, 2, uint40(block.timestamp + 1 days), "Open"
        );
        uint64 seq = request(id, alice);
        vm.prank(alice);
        vm.expectRevert(LuckyVault.AlreadyRequested.selector);
        vault.requestClaim{value: FEE}(id, bytes32(uint256(9)));
        fulfill(seq, 12);
        vm.prank(alice);
        vault.withdrawShare(id, alice);
        vm.prank(alice);
        vm.expectRevert(LuckyVault.AlreadyRequested.selector);
        vault.requestClaim{value: FEE}(id, bytes32(uint256(10)));
        vm.prank(alice);
        vm.expectRevert(LuckyVault.NothingToWithdraw.selector);
        vault.withdrawShare(id, alice);
        uint256 other = vault.createOpenPacket{value: 1 ether}(
            address(0), 1 ether, 1, uint40(block.timestamp + 1 days), "Another"
        );
        request(other, alice);
        assertEq(vault.getPacket(other).requested, 1);
    }

    function test_OpenERC20RefundPreservesAllocatedShare() public {
        token.mint(address(this), 100_000_000);
        token.approve(address(vault), 100_000_000);
        uint256 id = vault.createOpenPacket(
            address(token), 100_000_000, 2, uint40(block.timestamp + 1 days), "Open tokens"
        );
        fulfill(request(id, charlie), 8);
        (,, uint256 amount,) = vault.claims(id, charlie);
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        vm.expectRevert(LuckyVault.Unavailable.selector);
        vault.requestClaim{value: FEE}(id, 0);
        vault.refund(id, address(this));
        vm.prank(charlie);
        vault.withdrawShare(id, charlie);
        assertEq(token.balanceOf(charlie), amount);
        assertEq(token.balanceOf(address(this)) + amount, 100_000_000);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_OpenModeIsExplicitAndQuotaIsBounded() public {
        vm.expectRevert(LuckyVault.InvalidInput.selector);
        vault.createPacket{value: 1 ether}(
            address(0), 1 ether, 1, uint40(block.timestamp + 1 days), "Selected", new address[](0)
        );
        vm.expectRevert(LuckyVault.InvalidInput.selector);
        vault.createOpenPacket{value: 1 ether}(
            address(0), 1 ether, 0, uint40(block.timestamp + 1 days), "Open"
        );
        vm.expectRevert(LuckyVault.InvalidInput.selector);
        vault.createOpenPacket{value: 1 ether}(
            address(0), 1 ether, 101, uint40(block.timestamp + 1 days), "Open"
        );
        uint256 id = create(2, 1 ether);
        assertFalse(vault.openPackets(id));
        vm.expectRevert(LuckyVault.NotEligible.selector);
        vault.requestClaim{value: FEE}(id, 0);
    }

    function test_NativeLifecycleConservesPot() public {
        uint256 id = create(2, 10 ether);
        uint64 a = request(id, alice);
        uint64 b = request(id, bob);
        fulfill(b, 123); // Callbacks may arrive out of order.
        fulfill(a, 456);
        (,, uint256 aliceAmount,) = vault.claims(id, alice);
        (,, uint256 bobAmount,) = vault.claims(id, bob);
        assertEq(aliceAmount + bobAmount, 10 ether);
        assertGt(aliceAmount, 0);
        assertGt(bobAmount, 0);
        vm.prank(alice);
        vault.withdrawShare(id, alice);
        vm.prank(bob);
        vault.withdrawShare(id, bob);
        assertEq(address(vault).balance, 0);
        assertEq(vault.getPacket(id).remaining, 0);
    }

    function testFuzz_AccountingAndMinimum(uint128 amount, uint256 r1, uint256 r2) public {
        uint256 total = bound(uint256(amount), 3, 100 ether);
        uint256 id = create(3, total);
        uint64 a = request(id, alice);
        uint64 b = request(id, bob);
        uint64 c = request(id, charlie);
        fulfill(c, r1);
        fulfill(a, r2);
        fulfill(b, 0);
        (,, uint256 aa,) = vault.claims(id, alice);
        (,, uint256 bb,) = vault.claims(id, bob);
        (,, uint256 cc,) = vault.claims(id, charlie);
        assertEq(aa + bb + cc, total);
        uint256 minimum = total / 30;
        if (minimum == 0) minimum = 1;
        assertGe(aa, minimum);
        assertGe(bb, minimum);
        assertGe(cc, minimum);
    }

    function test_RejectsUnauthorizedAndDuplicateClaims() public {
        uint256 id = create(2, 1 ether);
        vm.expectRevert(LuckyVault.NotEligible.selector);
        vault.requestClaim{value: FEE}(id, 0);
        request(id, alice);
        vm.prank(alice);
        vm.expectRevert(LuckyVault.AlreadyRequested.selector);
        vault.requestClaim{value: FEE}(id, 0);
        assertEq(vault.getPacket(id).requested, 1);
    }

    function test_QuotaReservedBeforeCallbacks() public {
        uint256 id = create(1, 1 ether);
        request(id, alice);
        vm.prank(bob);
        vm.expectRevert(LuckyVault.Unavailable.selector);
        vault.requestClaim{value: FEE}(id, 0);
    }

    function test_RejectsForgedCallbackAndWrongProvider() public {
        uint256 id = create(2, 1 ether);
        uint64 seq = request(id, alice);
        vm.expectRevert(LuckyVault.Unauthorized.selector);
        vault._entropyCallback(seq, provider, 0);
        vm.expectRevert(LuckyVault.Unauthorized.selector);
        entropy.fulfill(vault, seq, alice, 0);
    }

    function test_DuplicateCallbackCannotReallocate() public {
        uint256 id = create(2, 1 ether);
        uint64 seq = request(id, alice);
        fulfill(seq, 7);
        uint256 beforeRemaining = vault.getPacket(id).remaining;
        fulfill(seq, 100);
        assertEq(vault.getPacket(id).remaining, beforeRemaining);
        assertEq(vault.getPacket(id).settled, 1);
    }

    function test_RefundKeepsAllocatedShares() public {
        uint256 id = create(2, 1 ether);
        fulfill(request(id, alice), 4);
        (,, uint256 amount,) = vault.claims(id, alice);
        vm.warp(block.timestamp + 1 days);
        vault.refund(id, address(this));
        assertEq(address(vault).balance, amount);
        vm.prank(alice);
        vault.withdrawShare(id, alice);
        assertEq(address(vault).balance, 0);
    }

    function test_PendingOracleTimeoutAndLateCallback() public {
        uint256 id = create(2, 1 ether);
        uint64 seq = request(id, alice);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(LuckyVault.PendingDraws.selector);
        vault.refund(id, address(this));
        vm.warp(block.timestamp + 1 hours + 1);
        vault.refund(id, address(this));
        fulfill(seq, 7);
        (,, uint256 amount,) = vault.claims(id, alice);
        assertEq(amount, 0);
        assertEq(address(vault).balance, 0);
    }

    function test_ExpiredCallbackCannotBeatRefund() public {
        uint256 id = create(2, 1 ether);
        uint64 seq = request(id, alice);
        vm.warp(block.timestamp + 1 days + 1 hours + 1);
        fulfill(seq, 1);
        assertEq(vault.getPacket(id).remaining, 1 ether);
        vault.refund(id, address(this));
    }

    function test_ExpiryBoundaryAndWrongFee() public {
        uint256 id = create(2, 1 ether);
        vm.prank(alice);
        vm.expectRevert(LuckyVault.WrongFee.selector);
        vault.requestClaim(id, 0);
        assertEq(vault.getPacket(id).requested, 0);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        vm.expectRevert(LuckyVault.Unavailable.selector);
        vault.requestClaim{value: FEE}(id, 0);
        vault.refund(id, address(this));
    }

    function test_DoubleWithdrawalAndWrongOwner() public {
        uint256 id = create(1, 1 ether);
        fulfill(request(id, alice), 4);
        vm.prank(bob);
        vm.expectRevert(LuckyVault.NothingToWithdraw.selector);
        vault.withdrawShare(id, bob);
        vm.prank(alice);
        vault.withdrawShare(id, alice);
        vm.prank(alice);
        vm.expectRevert(LuckyVault.NothingToWithdraw.selector);
        vault.withdrawShare(id, alice);
    }

    function test_ERC20FlowAndIndependentPots() public {
        uint256 nativeId = create(1, 2 ether);
        token.mint(address(this), 100_000_000);
        token.approve(address(vault), 100_000_000);
        uint256 id = vault.createPacket(
            address(token), 100_000_000, 1, uint40(block.timestamp + 1 days), "Tokens", recipients()
        );
        fulfill(request(id, bob), 7);
        vm.prank(bob);
        vault.withdrawShare(id, bob);
        assertEq(token.balanceOf(bob), 100_000_000);
        assertEq(vault.getPacket(nativeId).remaining, 2 ether);
    }

    function test_RejectingReceiverDoesNotBlockOthersAndCanRecover() public {
        LuckyReceiver receiver = new LuckyReceiver(vault);
        address[] memory list = new address[](2);
        list[0] = address(receiver);
        list[1] = bob;
        uint256 id = vault.createPacket{value: 1 ether}(
            address(0), 1 ether, 2, uint40(block.timestamp + 1 days), "Receivers", list
        );
        receiver.request{value: FEE}(id);
        (, uint64 seq,,) = vault.claims(id, address(receiver));
        fulfill(seq, 4);
        fulfill(request(id, bob), 5);
        vm.expectRevert(LuckyVault.TransferFailed.selector);
        receiver.collect(id, address(receiver));
        (,,, bool withdrawn) = vault.claims(id, address(receiver));
        assertFalse(withdrawn);
        receiver.collect(id, alice);
        vm.prank(bob);
        vault.withdrawShare(id, bob);
        assertEq(address(vault).balance, 0);
    }

    function test_InvalidRecipientListsAndFundingRevert() public {
        address[] memory list = recipients();
        list[1] = alice;
        vm.expectRevert(LuckyVault.InvalidInput.selector);
        vault.createPacket{value: 1 ether}(
            address(0), 1 ether, 2, uint40(block.timestamp + 1 days), "Dup", list
        );
        vm.expectRevert(LuckyVault.InvalidInput.selector);
        create(4, 1 ether);
        vm.expectRevert(LuckyVault.InvalidInput.selector);
        create(2, 1);
        assertEq(vault.nextPacketId(), 1);
    }

    function test_OnlySenderCanRefundAndCannotRefundTwice() public {
        uint256 id = create(1, 1 ether);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        vm.expectRevert(LuckyVault.Unauthorized.selector);
        vault.refund(id, alice);
        vault.refund(id, address(this));
        vm.expectRevert(LuckyVault.Unavailable.selector);
        vault.refund(id, address(this));
    }

    function test_CreatedLinksPagination() public {
        create(1, 1 ether);
        create(1, 1 ether);
        create(1, 1 ether);
        uint256[] memory ids = vault.getCreatedPackets(address(this), 1, 1);
        assertEq(ids.length, 1);
        assertEq(ids[0], 2);
        assertEq(vault.getCreatedPackets(address(this), 3, 50).length, 0);
        assertEq(vault.getCreatedPackets(alice, 0, 50).length, 0);
    }

    function test_FeeOnTransferDepositRevertsAtomically() public {
        MockFeeOnTransferERC20 taxed = new MockFeeOnTransferERC20("Taxed", "TAX", 6, 100);
        taxed.mint(address(this), 100_000_000);
        taxed.approve(address(vault), 100_000_000);
        vm.expectRevert(LuckyVault.UnsupportedToken.selector);
        vault.createPacket(
            address(taxed), 100_000_000, 2, uint40(block.timestamp + 1 days), "Taxed", recipients()
        );
        assertEq(vault.nextPacketId(), 1);
        assertEq(taxed.balanceOf(address(this)), 100_000_000);
        assertEq(taxed.balanceOf(address(vault)), 0);
    }

    function test_ReentrantReceiverCannotCollectTwice() public {
        ReenteringLuckyReceiver receiver = new ReenteringLuckyReceiver(vault);
        address[] memory list = new address[](1);
        list[0] = address(receiver);
        uint256 id = vault.createPacket{value: 1 ether}(
            address(0), 1 ether, 1, uint40(block.timestamp + 1 days), "Reentry", list
        );
        receiver.request{value: FEE}(id);
        (, uint64 sequence,,) = vault.claims(id, address(receiver));
        fulfill(sequence, 7);
        receiver.collect();
        assertTrue(receiver.blocked());
        assertEq(address(receiver).balance, 1 ether);
        assertEq(address(vault).balance, 0);
    }

    function testFuzz_UpTo100RecipientsConserveFunds(uint8 rawSlots, uint128 rawTotal, uint256 seed)
        public
    {
        uint16 slots = uint16(bound(uint256(rawSlots), 1, 100));
        uint256 total = bound(uint256(rawTotal), slots, 100 ether);
        address[] memory list = new address[](slots);
        for (uint256 i; i < slots; i++) {
            list[i] = address(uint160(1000 + i));
        }
        uint256 id = vault.createPacket{value: total}(
            address(0), total, slots, uint40(block.timestamp + 1 days), "Group", list
        );
        uint256 allocated;
        for (uint256 i; i < slots; i++) {
            vm.deal(list[i], FEE);
            fulfill(request(id, list[i]), uint256(keccak256(abi.encode(seed, i))));
            (,, uint256 amount,) = vault.claims(id, list[i]);
            assertGt(amount, 0);
            allocated += amount;
            vm.prank(list[i]);
            vault.withdrawShare(id, list[i]);
        }
        assertEq(allocated, total);
        assertEq(address(vault).balance, 0);
    }
}
