// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {LinkVault} from "../src/LinkVault.sol";

/**
 * @title DeployLinkVault
 * @notice Deployment script for LinkVault.
 * @dev Usage:
 *      forge script script/DeployLinkVault.s.sol \
 *        --rpc-url monad_testnet \
 *        --private-key $PRIVATE_KEY \
 *        --broadcast
 */
contract DeployLinkVault is Script {
    function run() external returns (LinkVault vault) {
        vm.startBroadcast();
        vault = new LinkVault();
        vm.stopBroadcast();

        // Log the deployed address for easy copy-paste
        // forge-impl: console2
        // console2.log("LinkVault deployed at:", address(vault));
    }
}
