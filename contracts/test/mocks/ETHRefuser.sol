// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title ETHRefuser
 * @notice A contract that deliberately reverts on receiving native ETH.
 *         Used to test LinkVault's pull-pattern fallback (HIGH-2): when
 *         `d.sender` is a contract that refuses ETH, `_transfer` must park
 *         the funds in `failedRefunds[depositId]` instead of bricking.
 */
contract ETHRefuser {
    /// @dev Reject all incoming ETH.
    receive() external payable {
        revert("ETHRefuser: I refuse ETH");
    }

    /// @dev Fallback also reverts to be extra defensive.
    fallback() external payable {
        revert("ETHRefuser: no fallback");
    }
}
