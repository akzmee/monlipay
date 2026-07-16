// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title MockNonStandardERC20
 * @notice Simulates non-standard ERC-20 tokens (like USDT on Ethereum) that
 *         do NOT return a bool from transfer/transferFrom. This is used to
 *         verify that SafeERC20 correctly handles these tokens.
 */
contract MockNonStandardERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 public totalSupply;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external {
        _allowances[msg.sender][spender] = amount;
    }

    // NOTE: No bool return — this is the "non-standard" behavior
    function transfer(address to, uint256 amount) external {
        _doTransfer(msg.sender, to, amount);
    }

    // NOTE: No bool return — this is the "non-standard" behavior
    function transferFrom(address from, address to, uint256 amount) external {
        uint256 allowed = _allowances[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "Insufficient allowance");
            _allowances[from][msg.sender] = allowed - amount;
        }
        _doTransfer(from, to, amount);
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
