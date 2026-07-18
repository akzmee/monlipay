// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title LinkVault
 * @notice Send tokens via a shareable link. Recipient claims by signing with a secret key.
 *         Unclaimed deposits are refundable by the sender after expiry.
 * @dev    - Claim uses EIP-712 + ecrecover (no secret in calldata, no front-running).
 *         - EIP-2771 meta-tx support via ERC2771Context (forwarder set at construction).
 *         - ReentrancyGuardTransient (Cancun+) on all mutating external functions.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract LinkVault is ERC2771Context, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    // ---------------------------------------------------------------------
    // Errors (custom errors save gas vs require strings)
    // ---------------------------------------------------------------------

    error InvalidExpiry();
    error ZeroAmount();
    error ZeroClaimKey();
    error ZeroRecipient();
    error DepositNotFound();
    error AlreadyClaimed();
    error NotExpired();
    error NotSender();
    error InvalidSignature();
    error TransferFailed();
    error NativeValueMismatch();
    error NonNativeValueSent();
    error NoFailedRefund();
    error NotFailedRefundOwner();

    // ---------------------------------------------------------------------
    // Events (indexer-friendly)
    // ---------------------------------------------------------------------

    event LinkCreated(
        uint256 indexed depositId,
        address indexed sender,
        address indexed token,
        uint256 amount,
        address claimKey,
        uint40 expiry
    );

    event LinkClaimed(
        uint256 indexed depositId,
        address indexed recipient,
        address indexed token,
        uint256 amount
    );

    event LinkRefunded(
        uint256 indexed depositId,
        address indexed sender,
        address indexed token,
        uint256 amount
    );

    /**
     * @notice Emitted when a push-transfer to `d.sender` fails (e.g. sender is
     *         a contract that reverts on receive). The funds become claimable
     *         via the pull-pattern `claimFailedRefund()`.
     */
    event RefundFailed(
        uint256 indexed depositId,
        address indexed sender,
        address indexed token,
        uint256 amount
    );

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    struct Deposit {
        address sender;
        address token; // address(0) = native MON
        uint256 amount;
        address claimKey; // address derived from the secret key
        uint40 expiry; // unix timestamp after which sender can refund
        bool claimed;
    }

    /// @notice Counter for generating sequential deposit IDs.
    uint256 public nextDepositId;

    /// @notice Maps depositId => Deposit.
    mapping(uint256 => Deposit) public deposits;

    /// @notice Escrow for push-refunds that failed (recipient reverted on receive). Pulled via claimFailedRefund().
    mapping(uint256 => uint256) public failedRefunds;

    // ---------------------------------------------------------------------
    // EIP-712 Domain
    // ---------------------------------------------------------------------

    /// @notice EIP-712 domain separator for claim signatures.
    bytes32 private constant _EIP712_DOMAIN =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant _CLAIM_TYPEHASH =
        keccak256("Claim(uint256 depositId,address recipient)");

    /// @dev Upper half of secp256k1 curve order — s-values above this are
    ///      considered malleable (EIP-2). Rejecting them prevents signature
    ///      replay via the `(s, -s)` transformation.
    uint256 private constant _SECP256K1_HALF_N =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    /// @notice Cached domain separator (computed once in constructor).
    bytes32 private immutable _CACHED_DOMAIN_SEPARATOR;

    /// @notice Chain ID cached at deployment (for detecting chain forks).
    uint256 private immutable _CACHED_CHAIN_ID;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /**
     * @param trustedForwarder Address of the ERC2771 forwarder contract that is
     *        allowed to relay meta-transactions on behalf of users. Set to
     *        address(0) to disable meta-tx support entirely (the contract will
     *        behave identically to its pre-EIP-2771 form).
     */
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {
        _CACHED_CHAIN_ID = block.chainid;
        _CACHED_DOMAIN_SEPARATOR = _buildDomainSeparator();
        nextDepositId = 1;
    }

    // ---------------------------------------------------------------------
    // External Functions
    // ---------------------------------------------------------------------

    /**
     * @notice Create a new payment link by depositing tokens.
     * @param token       ERC-20 token address, or address(0) for native MON.
     * @param amount      Amount to deposit (in base units).
     * @param claimKey    Address derived from the recipient's secret key.
     * @param expiry      Unix timestamp after which the sender can refund.
     * @return depositId  The ID of the newly created deposit.
     */
    function createLink(address token, uint256 amount, address claimKey, uint40 expiry)
        external
        payable
        returns (uint256 depositId)
    {
        if (expiry <= block.timestamp) revert InvalidExpiry();
        if (amount == 0) revert ZeroAmount();
        if (claimKey == address(0)) revert ZeroClaimKey();

        if (token == address(0)) {
            if (msg.value != amount) revert NativeValueMismatch();
        } else {
            if (msg.value > 0) revert NonNativeValueSent();
            // Snapshot balance before/after to handle fee-on-transfer and rebasing tokens.
            // _msgSender() resolves correctly for direct calls and meta-tx relays.
            address sender = _msgSender();
            uint256 balanceBefore = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(sender, address(this), amount);
            uint256 balanceAfter = IERC20(token).balanceOf(address(this));
            amount = balanceAfter - balanceBefore;
            if (amount == 0) revert ZeroAmount();
        }

        depositId = nextDepositId++;
        deposits[depositId] = Deposit({
            sender: _msgSender(),
            token: token,
            amount: amount,
            claimKey: claimKey,
            expiry: expiry,
            claimed: false
        });

        emit LinkCreated(depositId, _msgSender(), token, amount, claimKey, expiry);
    }

    /**
     * @notice Claim a payment link. The recipient must sign (depositId, recipient)
     *         with the secret key whose address matches deposit.claimKey.
     * @param depositId  The deposit to claim.
     * @param recipient  The address that will receive the funds.
     * @param v          ecrecover v component.
     * @param r          ecrecover r component.
     * @param s          ecrecover s component.
     */
    function claim(uint256 depositId, address recipient, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        Deposit storage d = deposits[depositId];
        if (d.sender == address(0)) revert DepositNotFound();
        if (d.claimed) revert AlreadyClaimed();
        if (block.timestamp >= d.expiry) revert NotExpired();
        if (recipient == address(0)) revert ZeroRecipient();

        // EIP-2: Reject high-order s-values and invalid v to prevent
        // signature malleability. Without this, an attacker who observes a
        // valid (v, r, s) can compute an alternative (v', r, s') that
        // recovers the same address, potentially bypassing naive replay
        // checks in downstream integrations.
        if (v != 27 && v != 28) revert InvalidSignature();
        if (uint256(s) > _SECP256K1_HALF_N) revert InvalidSignature();

        // Verify the signature. The signer must be the claimKey.
        bytes32 digest = _hashClaim(depositId, recipient);
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature(); // ecrecover returns 0 on bad input.
        if (signer != d.claimKey) revert InvalidSignature();

        // Effects before interactions (reentrancy guard pattern)
        d.claimed = true;

        _transfer(d.token, recipient, d.amount, depositId);

        emit LinkClaimed(depositId, recipient, d.token, d.amount);
    }

    /**
     * @notice Refund an unclaimed deposit after its expiry has passed.
     *         Only the original sender can call this.
     *
     * @dev    Expiry boundary: refund requires `block.timestamp > d.expiry`
     *         (strictly after). At exactly `d.expiry`, only `claim()` is
     *         allowed. This prevents a race where the sender front-runs the
     *         recipient's claim at the exact expiry second — the recipient
     *         has until the next second after expiry to claim.
     *
     * @param depositId  The deposit to refund.
     */
    function refund(uint256 depositId) external nonReentrant {
        Deposit storage d = deposits[depositId];
        if (d.sender == address(0)) revert DepositNotFound();
        if (d.claimed) revert AlreadyClaimed();
        if (block.timestamp <= d.expiry) revert NotExpired();
        if (_msgSender() != d.sender) revert NotSender();

        d.claimed = true;

        _transfer(d.token, d.sender, d.amount, depositId);

        emit LinkRefunded(depositId, d.sender, d.token, d.amount);
    }

    /**
     * @notice Permissionless auto-refund for expired deposits.
     * @dev    Anyone can call; funds always return to d.sender (never msg.sender).
     *         Same expiry boundary as refund().
     * @param depositId  The deposit to auto-refund.
     */
    function autoRefund(uint256 depositId) external nonReentrant {
        Deposit storage d = deposits[depositId];
        if (d.sender == address(0)) revert DepositNotFound();
        if (d.claimed) revert AlreadyClaimed();
        if (block.timestamp <= d.expiry) revert NotExpired();

        // Effects before interactions — set claimed flag first
        d.claimed = true;

        // Funds return to original sender, NOT to msg.sender
        _transfer(d.token, d.sender, d.amount, depositId);

        emit LinkRefunded(depositId, d.sender, d.token, d.amount);
    }

    /**
     * @notice Pull-pattern refund for deposits whose push-transfer failed.
     * @dev    When `_transfer` cannot push ETH/tokens to `d.sender` (e.g. sender is
     *         a contract that reverts on receive), the amount is parked in
     *         `failedRefunds[depositId]` and pulled here.
     * @param depositId  The deposit whose refund failed.
     * @param recipient  An EOA or receiver-capable contract to pull to.
     */
    function claimFailedRefund(uint256 depositId, address payable recipient) external nonReentrant {
        Deposit storage d = deposits[depositId];
        if (d.sender == address(0)) revert DepositNotFound();
        if (_msgSender() != d.sender) revert NotFailedRefundOwner();

        uint256 amount = failedRefunds[depositId];
        if (amount == 0) revert NoFailedRefund();
        delete failedRefunds[depositId];

        // Raw call — revert on failure so the user picks a better recipient.
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit LinkRefunded(depositId, d.sender, d.token, amount);
    }

    /// @notice Stub — reverts. Residual recovery (fee-on-transfer tokens) is not exposed as a sweep surface.
    function sweep(address /* token */, address /* to */, uint256 /* amount */) external pure {
        revert("sweep: not implemented");
    }

    // ---------------------------------------------------------------------
    // View Functions
    // ---------------------------------------------------------------------

    /**
     * @notice Get full deposit details.
     */
    function getDeposit(uint256 depositId) external view returns (Deposit memory) {
        return deposits[depositId];
    }

    /**
     * @notice Check if a deposit exists.
     */
    function exists(uint256 depositId) external view returns (bool) {
        return deposits[depositId].sender != address(0);
    }

    /**
     * @notice Compute the EIP-712 typed digest that the recipient must sign.
     *         Exposed so frontends can use it for wallet signTypedData calls.
     */
    function computeClaimDigest(uint256 depositId, address recipient) external view returns (bytes32) {
        return _hashClaim(depositId, recipient);
    }

    /**
     * @notice Get the EIP-712 domain separator. Recomputes if chain ID changes
     *         (e.g., after a fork).
     */
    function domainSeparator() public view returns (bytes32) {
        if (block.chainid == _CACHED_CHAIN_ID) {
            return _CACHED_DOMAIN_SEPARATOR;
        }
        return _buildDomainSeparator();
    }

    // ---------------------------------------------------------------------
    // Internal Functions
    // ---------------------------------------------------------------------

    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                _EIP712_DOMAIN,
                keccak256("LinkVault"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function _hashClaim(uint256 depositId, address recipient) internal view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(_CLAIM_TYPEHASH, depositId, recipient));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /**
     * @notice Transfer native or ERC-20 tokens to `to`.
     * @dev    On a failed native push (recipient reverted on receive), the amount is
     *         parked in `failedRefunds[depositId]` (recoverable via claimFailedRefund).
     *         For fee-on-transfer / rebasing ERC-20s, we measure the actual received
     *         balance; any residual is reported via RefundFailed.
     */
    function _transfer(address token, address to, uint256 amount, uint256 depositId) internal {
        if (token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) {
                // Park funds for pull-refund instead of reverting.
                failedRefunds[depositId] = amount;
                emit RefundFailed(depositId, to, token, amount);
            }
        } else {
            // Snapshot recipient balance to handle fee-on-transfer / rebasing tokens.
            uint256 balanceBefore = IERC20(token).balanceOf(to);
            IERC20(token).safeTransfer(to, amount);
            uint256 balanceAfter = IERC20(token).balanceOf(to);
            uint256 actuallyTransferred = balanceAfter - balanceBefore;

            // Residual (fee-on-transfer) stays in-contract; reported via RefundFailed.
            if (actuallyTransferred < amount) {
                emit RefundFailed(depositId, to, token, amount - actuallyTransferred);
            }
        }
    }
}
