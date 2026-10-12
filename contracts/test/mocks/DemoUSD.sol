// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Demonstration token, NOT a stablecoin and NOT redeemable for dollars.
/// @dev Restricted to Monad testnet. Six decimals exercise stablecoin-sized units.
contract DemoUSD is ERC20 {
    constructor() ERC20("Demo USD (testnet only)", "DEMOUSD") {
        require(block.chainid == 10143, "Monad testnet only");
        _mint(msg.sender, 1_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) { return 6; }
}
