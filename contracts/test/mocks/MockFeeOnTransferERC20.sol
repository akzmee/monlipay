// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockFeeOnTransferERC20
 * @notice ERC-20 that deducts a fee on every transfer. Used to test that
 *         LinkVault's `_transfer` correctly reconciles balances and does not
 *         brick on fee-on-transfer tokens (MEDIUM-1).
 */
contract MockFeeOnTransferERC20 is ERC20 {
    uint8 private _decimals;
    /// @dev Fee in basis points (e.g. 100 = 1%).
    uint256 public feeBps;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 feeBps_)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
        feeBps = feeBps_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev OZ _transfer hook — deduct fee from amount received by recipient.
    function _update(address from, address to, uint256 amount) internal override {
        if (from == address(0) || to == address(0)) {
            // mint / burn — no fee
            super._update(from, to, amount);
            return;
        }
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;
        // Send net to recipient
        super._update(from, to, net);
        // Fee stays with sender (i.e. not moved) — burn by sending to address(0)
        if (fee > 0) {
            super._update(from, address(0), fee);
        }
    }
}
