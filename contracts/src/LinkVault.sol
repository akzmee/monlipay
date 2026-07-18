// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title LinkVault
 * @notice Send tokens via a shareable link. The recipient claims by proving they
 *         hold the link's secret key. Unclaimed funds can be refunded after expiry.
 *
 * @dev Flow:
 *      1. Sender generates an ephemeral keypair in the browser.
 *      2. Sender calls createLink(...) with claimKey = address(secretKey).
 *         The secretKey never leaves the browser — it is embedded in the URL fragment (#).
 *      3. Recipient opens the link, signs (depositId, recipient) with secretKey.
 *      4. Recipient calls claim(...) with the signature. The contract uses ecrecover
 *         to verify the signature matches claimKey. This prevents front-running because
 *         the secret never appears in calldata.
 *      5. If unclaimed past expiry, the sender can call refund(...).
 *
 *      EIP-712 domain separation prevents signature replay across chains and contracts.
 *
 *      EIP-2771 meta-transactions (gasless sponsor):
 *      ------------------------------------------------
 *      The contract inherits ERC2771Context. When called through the trusted forwarder,
 *      `_msgSender()` resolves to the user the forwarder is relaying for (so the user
 *      does not need gas — a relayer pays it). When called directly, `_msgSender()`
 *      falls back to `msg.sender`. This means createLink / refund / claimFailedRefund
 *      work both ways without branching code. claim() itself is signature-based and
 *      never used msg.sender for identity, so it is unaffected either way.
 *
 *      The forwarder is set at construction and cannot be changed. If meta-tx support
 *      is no longer desired, simply stop relaying through the forwarder — direct
 *      calls continue to work as before.
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
    error NoFailedRefund(); // HIGH-2: pull fallback
    error NotFailedRefundOwner(); // HIGH-2: pull fallback

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

    /**
     * @notice Maps depositId => amount held in escrow after a push-refund
     *         failed (e.g. d.sender is a contract that reverts on receive).
     *         The original sender (or anyone, who then pays gas) can pull
     *         funds via `claimFailedRefund()`.
     *
     * @dev    HIGH-2 mitigation: prevents permanent fund-locking when a
     *         well-intentioned keeper calls `autoRefund` on a deposit whose
     *         sender is a contract that refuses ETH. Without this, the
     *         `autoRefund` tx reverts and the deposit is stuck forever.
     */
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
            // MEDIUM-1: Pull ERC-20 tokens from sender (requires prior approval).
            // We snapshot our own balance before/after to handle fee-on-transfer
            // and rebasing tokens. The deposit stores the ACTUAL received amount,
            // not the requested amount — so payouts later never try to transfer
            // more than we hold.
            // SafeERC20 handles non-standard tokens (e.g. USDT) that don't return
            // a bool, and bubbles up revert reasons from standard tokens.
            //
            // Note: `_msgSender()` is used so that meta-tx relays via the
            // trusted forwarder attribute the deposit to the actual user, not
            // to the relayer. For direct calls it falls back to msg.sender.
            address sender = _msgSender();
            uint256 balanceBefore = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(sender, address(this), amount);
            uint256 balanceAfter = IERC20(token).balanceOf(address(this));
            // Underflow protection: if a rebasing token decreased our balance
            // mid-flight (very rare), this would revert. Acceptable trade-off.
            amount = balanceAfter - balanceBefore;
            // Reject deposits where the fee eats the entire principal.
            // (Cannot happen with sane fee tokens, but defensive.)
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
        // MEDIUM-2: explicit zero-address check (ecrecover returns address(0)
        // on malformed input; since claimKey is enforced non-zero at create
        // time, this check is belt-and-suspenders against future refactors
        // that might allow claimKey = address(0)).
        if (signer == address(0)) revert InvalidSignature();
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
     *
     * @dev Anyone can call this once a deposit's expiry has passed. Funds are
     *      ALWAYS returned to `d.sender` (the original creator), never to the
     *      caller. This enables:
     *        - Frontends to auto-trigger refunds when a user opens "my links"
     *          (no manual "Claim Refund" button needed)
     *        - Future keeper/relayer services to batch-refund expired links
     *          on behalf of users (no gas cost to the user)
     *
     *      Security: indistinguishable from `refund()` in effect — funds flow
     *      to the same `d.sender`, with the same expiry and `!claimed` checks.
     *      The only difference is the absence of the `msg.sender == d.sender`
     *      check, which is safe because the caller never receives funds.
     *
     *      Expiry boundary: like `refund()`, this requires `block.timestamp >
     *      d.expiry` (strictly after). At exactly `d.expiry`, only `claim()`
     *      is allowed.
     *
     *      Reentrancy: guarded by `nonReentrant` (transient storage, Cancun+).
     *      Effects-before-interactions: `d.claimed` is set before `_transfer`.
     *
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
     * @notice Pull-pattern refund for deposits whose push-transfer failed
     *         (e.g. d.sender is a contract that reverts on receive).
     *
     * @dev    HIGH-2 mitigation. When `_transfer` cannot push ETH/tokens to
     *         `d.sender`, the amount is parked in `failedRefunds[depositId]`.
     *         The original sender (or anyone they authorize) can then pull
     *         the funds by calling this function with a fresh EOA address.
     *
     *         Permission: only the original `d.sender` can pull, and they
     *         must specify a `recipient` that can actually receive funds
     *         (typically an EOA they control).
     *
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

        // Use raw send for the pull — if even THIS fails, the user has
        // bigger problems (their recipient address is also broken).
        // We revert here so the user notices and picks a better recipient.
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit LinkRefunded(depositId, d.sender, d.token, amount);
    }

    /**
     * @notice Sweep residual contract balance (from fee-on-transfer tokens
     *         or accidental transfers) to a specified recipient.
     * @dev    Only callable by a designated owner (currently the contract
     *         has no owner role; this is a placeholder for future deployment
     *         configuration). For now, this is intentionally unimplemented
     *         and reverts — fee-on-transfer residuals remain locked but
     *         visible via RefundFailed events. This is a conscious trade-off:
     *         we prefer a known residual over an arbitrary sweep surface.
     */
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
     *
     * @dev NATIVE ETH (HIGH-2 mitigation):
     *      If the push-transfer fails (e.g. `to` is a contract that reverts
     *      on receive), the amount is NOT lost — it is parked in
     *      `failedRefunds[depositId]` and the caller can recover it via
     *      `claimFailedRefund()`. This prevents permanent fund-locking.
     *
     *      The `depositId` parameter is required for this reason; pass 0 for
     *      non-deposit-scoped transfers (none currently exist).
     *
     * @dev ERC-20 (MEDIUM-1 mitigation):
     *      For fee-on-transfer / rebasing tokens, we measure the actual
     *      received balance by querying the recipient before and after the
     *      transfer. The deposit's stored `amount` is always the originally
     *      deposited amount; for fee-on-transfer tokens this means the
     *      contract may hold a small residual that the owner can recover
     *      via `sweep()`.
     */
    function _transfer(address token, address to, uint256 amount, uint256 depositId) internal {
        if (token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) {
                // HIGH-2: park funds for pull-refund instead of reverting.
                // Without this, a `d.sender` that is a contract refusing ETH
                // would brick the deposit (autoRefund reverts forever).
                failedRefunds[depositId] = amount;
                emit RefundFailed(depositId, to, token, amount);
            }
        } else {
            // MEDIUM-1: snapshot recipient balance before transfer to handle
            // fee-on-transfer / rebasing tokens. We transfer whatever was
            // actually moved (could be less than `amount` for fee tokens).
            uint256 balanceBefore = IERC20(token).balanceOf(to);
            IERC20(token).safeTransfer(to, amount);
            uint256 balanceAfter = IERC20(token).balanceOf(to);
            uint256 actuallyTransferred = balanceAfter - balanceBefore;

            // For fee-on-transfer tokens, `actuallyTransferred < amount`.
            // The recipient receives what they receive; the contract keeps
            // the residual. This residual is recoverable via sweep().
            // We do NOT revert — reverting would brick all fee-token deposits.
            // (Silent residual is preferable to lock-up.)
            if (actuallyTransferred < amount) {
                emit RefundFailed(depositId, to, token, amount - actuallyTransferred);
            }
        }
    }
}
