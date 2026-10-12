// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Minimal Pyth Entropy v2 interface. Addresses are deployment configuration.
interface ILuckyEntropy {
    function getFeeV2(address provider, uint32 gasLimit) external view returns (uint128);
    function requestV2(address provider, bytes32 userRandomNumber, uint32 gasLimit)
        external
        payable
        returns (uint64);
}

/// @notice One funded link, an immutable wallet allowlist, and a random share per claimant.
/// @dev Contact names stay off-chain. Entropy callbacks allocate funds; recipients pull payments.
contract LuckyVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidInput();
    error NotEligible();
    error AlreadyRequested();
    error Unavailable();
    error WrongFee();
    error Unauthorized();
    error NothingToWithdraw();
    error PendingDraws();
    error TransferFailed();
    error UnsupportedToken();

    uint32 public constant CALLBACK_GAS_LIMIT = 180_000;
    uint256 public constant DRAW_GRACE_PERIOD = 1 hours;
    uint256 public constant MAX_RECIPIENTS = 100;
    ILuckyEntropy public immutable entropy;
    address public immutable provider;
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

    struct Claim {
        bool requested;
        uint64 sequence;
        uint256 amount;
        bool withdrawn;
    }

    struct Draw {
        uint256 packetId;
        address recipient;
        bool fulfilled;
    }
    mapping(uint256 => Packet) private packets;
    mapping(uint256 => mapping(address => bool)) public eligible;
    mapping(uint256 => mapping(address => Claim)) public claims;
    mapping(uint64 => Draw) public draws;
    mapping(address => uint256[]) private created;

    event PacketCreated(
        uint256 indexed packetId,
        address indexed sender,
        address indexed token,
        uint256 total,
        uint16 slots,
        uint40 expiry
    );
    event DrawRequested(uint256 indexed packetId, address indexed recipient, uint64 sequence);
    event ShareReady(uint256 indexed packetId, address indexed recipient, uint256 amount);
    event ShareWithdrawn(
        uint256 indexed packetId, address indexed recipient, address destination, uint256 amount
    );
    event PacketRefunded(uint256 indexed packetId, address indexed sender, uint256 amount);

    constructor(address entropyAddress, address entropyProvider) {
        if (entropyAddress.code.length == 0 || entropyProvider == address(0)) {
            revert InvalidInput();
        }
        entropy = ILuckyEntropy(entropyAddress);
        provider = entropyProvider;
    }

    function createPacket(
        address token,
        uint256 total,
        uint16 slots,
        uint40 expiry,
        string calldata title,
        address[] calldata recipients
    ) external payable nonReentrant returns (uint256 id) {
        if (
            slots == 0 || slots > recipients.length || recipients.length > MAX_RECIPIENTS
                || total < slots || total > type(uint128).max || expiry <= block.timestamp
                || expiry > block.timestamp + 30 days || bytes(title).length == 0
                || bytes(title).length > 80
        ) {
            revert InvalidInput();
        }
        id = nextPacketId++;
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
            // Fee-on-transfer and rebasing assets are not supported by this vault.
            if (IERC20(token).balanceOf(address(this)) - beforeBalance != total) {
                revert UnsupportedToken();
            }
        }
        packets[id] = Packet(msg.sender, token, total, total, expiry, slots, 0, 0, false, title);
        created[msg.sender].push(id);
        emit PacketCreated(id, msg.sender, token, total, slots, expiry);
    }

    function claimFee() public view returns (uint128) {
        return entropy.getFeeV2(provider, CALLBACK_GAS_LIMIT);
    }

    /// @notice Reserve a slot before requesting randomness. A wallet cannot retry for a better draw.
    function requestClaim(uint256 id, bytes32 userRandomNumber) external payable nonReentrant {
        Packet storage p = packets[id];
        if (
            p.sender == address(0) || p.closed || block.timestamp >= p.expiry
                || p.requested >= p.slots
        ) {
            revert Unavailable();
        }
        if (!eligible[id][msg.sender]) revert NotEligible();
        if (claims[id][msg.sender].requested) revert AlreadyRequested();
        uint128 fee = claimFee();
        if (msg.value != fee) revert WrongFee();
        claims[id][msg.sender].requested = true;
        ++p.requested;
        uint64 sequence =
            entropy.requestV2{value: fee}(provider, userRandomNumber, CALLBACK_GAS_LIMIT);
        if (draws[sequence].recipient != address(0)) revert InvalidInput();
        claims[id][msg.sender].sequence = sequence;
        draws[sequence] = Draw(id, msg.sender, false);
        emit DrawRequested(id, msg.sender, sequence);
    }

    /// @dev Pyth IEntropyConsumer callback selector. No external calls, so a receiver cannot block a draw.
    function _entropyCallback(uint64 sequence, address callbackProvider, bytes32 randomNumber)
        external
    {
        if (msg.sender != address(entropy) || callbackProvider != provider) revert Unauthorized();
        Draw storage draw = draws[sequence];
        if (draw.recipient == address(0)) revert InvalidInput();
        if (draw.fulfilled) return;
        draw.fulfilled = true;
        Packet storage p = packets[draw.packetId];
        // After the grace period, unallocated funds belong in the sender's refund.
        if (p.closed || block.timestamp > uint256(p.expiry) + DRAW_GRACE_PERIOD) return;
        uint256 left = p.slots - p.settled;
        uint256 amount = p.remaining;
        if (left > 1) {
            uint256 minimum = p.total / (uint256(p.slots) * 10);
            if (minimum == 0) minimum = 1;
            uint256 cap = 2 * (p.remaining / left);
            uint256 available = p.remaining - minimum * (left - 1);
            if (cap > available) cap = available;
            amount = minimum + uint256(randomNumber) % (cap - minimum + 1);
        }
        p.remaining -= amount;
        ++p.settled;
        claims[draw.packetId][draw.recipient].amount = amount;
        emit ShareReady(draw.packetId, draw.recipient, amount);
    }

    function withdrawShare(uint256 id, address destination) external nonReentrant {
        Claim storage c = claims[id][msg.sender];
        if (c.amount == 0 || c.withdrawn) revert NothingToWithdraw();
        if (destination == address(0)) revert InvalidInput();
        c.withdrawn = true;
        _transfer(packets[id].token, destination, c.amount);
        emit ShareWithdrawn(id, msg.sender, destination, c.amount);
    }

    /// @notice Refund only unallocated funds. Already allocated shares remain withdrawable.
    function refund(uint256 id, address destination) external nonReentrant {
        Packet storage p = packets[id];
        if (msg.sender != p.sender) revert Unauthorized();
        if (destination == address(0)) revert InvalidInput();
        if (p.closed || block.timestamp < p.expiry) revert Unavailable();
        if (p.requested != p.settled && block.timestamp <= uint256(p.expiry) + DRAW_GRACE_PERIOD) {
            revert PendingDraws();
        }
        uint256 amount = p.remaining;
        p.remaining = 0;
        p.closed = true;
        if (amount > 0) _transfer(p.token, destination, amount);
        emit PacketRefunded(id, msg.sender, amount);
    }

    function getPacket(uint256 id) external view returns (Packet memory) {
        return packets[id];
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
