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
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract LinkVault {
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

    // ---------------------------------------------------------------------
    // EIP-712 Domain
    // ---------------------------------------------------------------------

    /// @notice EIP-712 domain separator for claim signatures.
    bytes32 private constant _EIP712_DOMAIN =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private constant _CLAIM_TYPEHASH =
        keccak256("Claim(uint256 depositId,address recipient)");

    /// @notice Cached domain separator (computed once in constructor).
    bytes32 private immutable _CACHED_DOMAIN_SEPARATOR;

    /// @notice Chain ID cached at deployment (for detecting chain forks).
    uint256 private immutable _CACHED_CHAIN_ID;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor() {
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
            // Pull ERC-20 tokens from sender (requires prior approval)
            bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
            if (!ok) revert TransferFailed();
        }

        depositId = nextDepositId++;
        deposits[depositId] = Deposit({
            sender: msg.sender,
            token: token,
            amount: amount,
            claimKey: claimKey,
            expiry: expiry,
            claimed: false
        });

        emit LinkCreated(depositId, msg.sender, token, amount, claimKey, expiry);
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
    {
        Deposit storage d = deposits[depositId];
        if (d.sender == address(0)) revert DepositNotFound();
        if (d.claimed) revert AlreadyClaimed();
        if (block.timestamp >= d.expiry) revert NotExpired();
        if (recipient == address(0)) revert ZeroRecipient();

        // Verify the signature. The signer must be the claimKey.
        bytes32 digest = _hashClaim(depositId, recipient);
        address signer = ecrecover(digest, v, r, s);
        if (signer != d.claimKey) revert InvalidSignature();

        // Effects before interactions (reentrancy guard pattern)
        d.claimed = true;

        _transfer(d.token, recipient, d.amount);

        emit LinkClaimed(depositId, recipient, d.token, d.amount);
    }

    /**
     * @notice Refund an unclaimed deposit after its expiry has passed.
     *         Only the original sender can call this.
     * @param depositId  The deposit to refund.
     */
    function refund(uint256 depositId) external {
        Deposit storage d = deposits[depositId];
        if (d.sender == address(0)) revert DepositNotFound();
        if (d.claimed) revert AlreadyClaimed();
        if (block.timestamp < d.expiry) revert NotExpired();
        if (msg.sender != d.sender) revert NotSender();

        d.claimed = true;

        _transfer(d.token, d.sender, d.amount);

        emit LinkRefunded(depositId, d.sender, d.token, d.amount);
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

    function _transfer(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            bool ok = IERC20(token).transfer(to, amount);
            if (!ok) revert TransferFailed();
        }
    }
}
