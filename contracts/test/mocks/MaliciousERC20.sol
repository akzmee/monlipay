// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MaliciousERC20
 * @notice An ERC-20 token that calls a callback on a designated attacker
 *         contract during transfer. The attacker can then attempt to
 *         re-enter the vault before the original call completes.
 */
interface IReentrancyCallback {
    function onReceive() external;
}

contract MaliciousERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 public totalSupply;

    /// Address to call back during transfer (typically the attacker contract).
    address public callbackTarget;
    bool public shouldCallback;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function setCallbackTarget(address _target) external {
        callbackTarget = _target;
    }

    function setShouldCallback(bool _should) external {
        shouldCallback = _should;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _doTransfer(msg.sender, to, amount);
        if (shouldCallback && callbackTarget != address(0) && to == callbackTarget) {
            shouldCallback = false; // Prevent infinite loop
            IReentrancyCallback(callbackTarget).onReceive();
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = _allowances[from][msg.sender];
        require(allowed >= amount, "Insufficient allowance");
        _allowances[from][msg.sender] = allowed - amount;
        _doTransfer(from, to, amount);
        return true;
    }

    function _doTransfer(address from, address to, uint256 amount) internal {
        require(_balances[from] >= amount, "Insufficient balance");
        _balances[from] -= amount;
        _balances[to] += amount;
    }

    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
        totalSupply += amount;
    }
}
