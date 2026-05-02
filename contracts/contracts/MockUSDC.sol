// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// MockUSDC — 6 decimal test token for 0G Galileo testnet
contract MockUSDC is ERC20 {
    address public owner;

    constructor() ERC20("USD Coin", "USDC") {
        owner = msg.sender;
        // Mint 10,000 USDC to deployer for agent funding
        _mint(msg.sender, 10_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "only owner");
        _mint(to, amount);
    }

    function faucet(uint256 amount) external {
        require(amount <= 100 * 10 ** decimals(), "max 100 USDC per faucet call");
        _mint(msg.sender, amount);
    }
}
