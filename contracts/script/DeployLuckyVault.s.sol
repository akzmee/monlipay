// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {LuckyVault} from "../src/LuckyVault.sol";

contract DeployLuckyVault is Script {
    function run() external returns (LuckyVault vault) {
        address entropy = vm.envAddress("PYTH_ENTROPY_ADDRESS");
        address provider = vm.envAddress("PYTH_ENTROPY_PROVIDER");
        vm.startBroadcast();
        vault = new LuckyVault(entropy, provider);
        vm.stopBroadcast();
        console2.log("LuckyVault:", address(vault));
    }
}
