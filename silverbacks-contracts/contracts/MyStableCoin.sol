// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * MyStableCoin:
 * A simple ERC20 token representing a "stablecoin" for the Silverbacks system.
 */
contract MyStableCoin is ERC20 {
    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        // Mint the initial supply (in 18-decimal base units) to the deployer.
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) external {
        // Public mint function for testing/demonstration.
        _mint(to, amount);
    }
}
