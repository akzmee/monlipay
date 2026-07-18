// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {LinkVault} from "../src/LinkVault.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/**
 * @title DeployLinkVault
 * @notice Deployment script for LinkVault with an ERC-2771 forwarder for
 *         optional gasless meta-transactions.
 *
 * @dev Usage:
 *      forge script script/DeployLinkVault.s.sol \
 *        --rpc-url monad_testnet \
 *        --private-key $PRIVATE_KEY \
 *        --broadcast
 *
 *      To skip the forwarder (deploy the vault without meta-tx support),
 *      set DEPLOY_NO_FORWARDER=true in the env. This is useful for chains
 *      where meta-tx support is not desired.
 */
contract DeployLinkVault is Script {
    /// @dev Set to "true" to deploy without a forwarder (vault only).
    string constant NO_FORWARDER_ENV = "DEPLOY_NO_FORWARDER";

    function run() external returns (LinkVault vault, ERC2771Forwarder forwarder) {
        bool skipForwarder = vm.envOr(NO_FORWARDER_ENV, false);
        vm.startBroadcast();

        if (!skipForwarder) {
            // The forwarder domain name is purely informational — it shows up
            // in the EIP-712 domain of the meta-tx signature the user signs.
            forwarder = new ERC2771Forwarder("MonliPay LinkVault");
            vault = new LinkVault(address(forwarder));
        } else {
            vault = new LinkVault(address(0));
        }

        vm.stopBroadcast();

        console2.log("LinkVault deployed at:", address(vault));
        if (!skipForwarder) {
            console2.log("ERC2771Forwarder deployed at:", address(forwarder));
            console2.log("  -> Set NEXT_PUBLIC_LINK_VAULT_FORWARDER_ADDRESS=%s", address(forwarder));
        }
    }
}
