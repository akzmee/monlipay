// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice A funded group payment with an exact, equal amount per recipient.
/// @dev Packet views and creation events match LuckyVault for shared history.
///      There is no oracle, top-up, or administrative withdrawal authority.
contract GroupVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidInput();
    error UnevenPool();
    error NotEligible();
    error AlreadyClaimed();
    error Unavailable();
    error Unauthorized();
    error TransferFailed();
    error UnsupportedToken();

    uint256 public constant MAX_RECIPIENTS = 100;
    uint256 public nextPacketId = 1;

    struct Packet {
        address sender;
        address token;
        uint256 total;
        uint256 remaining;
        uint40 expiry;
        uint16 slots;
        uint16 requested;
        uint16 settled;
        bool closed;
        string title;
    }

    mapping(uint256 => Packet) private packets;
    mapping(uint256 => mapping(address => bool)) public eligible;
    mapping(uint256 => bool) public openPackets;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(address => uint256[]) private created;

    event PacketCreated(
        uint256 indexed packetId,
        address indexed sender,
        address indexed token,
        uint256 total,
        uint16 slots,
        uint40 expiry
    );
    event PacketAccessSet(uint256 indexed packetId, bool openAccess);
    event ShareWithdrawn(
        uint256 indexed packetId, address indexed recipient, address destination, uint256 amount
    );
    event PacketRefunded(uint256 indexed packetId, address indexed sender, uint256 amount);

    function createPacket(
        address token,
        uint256 total,
        uint16 slots,
        uint40 expiry,
        string calldata title,
        address[] calldata recipients
    ) external payable nonReentrant returns (uint256) {
        return _createPacket(token, total, slots, expiry, title, recipients, false);
    }

    function createOpenPacket(
        address token,
        uint256 total,
        uint16 slots,
        uint40 expiry,
        string calldata title
    ) external payable nonReentrant returns (uint256) {
        return _createPacket(token, total, slots, expiry, title, new address[](0), true);
    }

    function _createPacket(
        address token,
        uint256 total,
        uint16 slots,
        uint40 expiry,
        string memory title,
        address[] memory recipients,
        bool openAccess
    ) private returns (uint256 id) {
        if (
            slots == 0 || slots > MAX_RECIPIENTS || recipients.length > MAX_RECIPIENTS
                || (!openAccess && slots > recipients.length) || total < slots
                || total > type(uint128).max || expiry <= block.timestamp
                || expiry > block.timestamp + 30 days || bytes(title).length == 0
                || bytes(title).length > 80
        ) revert InvalidInput();
        // Do not silently round a recipient's promised amount or strand dust.
        if (total % slots != 0) revert UnevenPool();
        id = nextPacketId++;
        openPackets[id] = openAccess;
        for (uint256 i; i < recipients.length; ++i) {
            address recipient = recipients[i];
            if (recipient == address(0) || eligible[id][recipient]) revert InvalidInput();
            eligible[id][recipient] = true;
        }
        if (token == address(0)) {
            if (msg.value != total) revert InvalidInput();
        } else {
            if (msg.value != 0 || token.code.length == 0) revert InvalidInput();
            uint256 beforeBalance = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(msg.sender, address(this), total);
            if (IERC20(token).balanceOf(address(this)) - beforeBalance != total) {
                revert UnsupportedToken();
            }
        }
        packets[id] = Packet(msg.sender, token, total, total, expiry, slots, 0, 0, false, title);
        created[msg.sender].push(id);
        emit PacketCreated(id, msg.sender, token, total, slots, expiry);
        emit PacketAccessSet(id, openAccess);
    }

    /// @notice Claim one fixed share. All state changes roll back if transfer fails.
    /// @dev Eligibility and the one-claim limit belong to msg.sender, not destination.
    function claimShare(uint256 id, address destination) external nonReentrant {
        Packet storage p = packets[id];
        if (
            p.sender == address(0) || p.closed || block.timestamp >= p.expiry
                || p.requested >= p.slots
        ) revert Unavailable();
        if (!openPackets[id] && !eligible[id][msg.sender]) revert NotEligible();
        if (claimed[id][msg.sender]) revert AlreadyClaimed();
        if (destination == address(0)) revert InvalidInput();
        uint256 amount = p.total / p.slots;
        claimed[id][msg.sender] = true;
        p.remaining -= amount;
        ++p.requested;
        ++p.settled;
        _transfer(p.token, destination, amount);
        emit ShareWithdrawn(id, msg.sender, destination, amount);
    }

    /// @notice Only the sender can recover the unclaimed balance after expiry.
    function refund(uint256 id, address destination) external nonReentrant {
        Packet storage p = packets[id];
        if (msg.sender != p.sender) revert Unauthorized();
        if (destination == address(0)) revert InvalidInput();
        if (p.closed || block.timestamp < p.expiry) revert Unavailable();
        uint256 amount = p.remaining;
        p.remaining = 0;
        p.closed = true;
        if (amount > 0) _transfer(p.token, destination, amount);
        emit PacketRefunded(id, msg.sender, amount);
    }

    function getPacket(uint256 id) external view returns (Packet memory) {
        return packets[id];
    }

    /// @dev Shared claim-view ABI; equal payments are requested and withdrawn atomically.
    function claims(uint256 id, address recipient)
        external
        view
        returns (bool requested, uint64 sequence, uint256 amount, bool withdrawn)
    {
        bool paid = claimed[id][recipient];
        return (paid, 0, paid ? packets[id].total / packets[id].slots : 0, paid);
    }

    function getCreatedPackets(address sender, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids)
    {
        uint256 length = created[sender].length;
        if (offset >= length) return new uint256[](0);
        uint256 count = length - offset;
        if (count > limit) count = limit;
        if (count > 50) count = 50;
        ids = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            ids[i] = created[sender][length - 1 - offset - i];
        }
    }

    function _transfer(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
