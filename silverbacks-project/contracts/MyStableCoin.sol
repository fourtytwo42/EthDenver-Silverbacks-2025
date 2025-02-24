// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * MyStableCoin:
 * A simple ERC20 token representing a "stablecoin" for the Silverbacks system.
 */
contract MyStableCoin is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        // Optionally mint initial supply to deployer if desired.
        // _mint(msg.sender, 1000000 * 10**18);
    }

    function mint(address to, uint256 amount) external {
        // Public mint function for testing/demonstration.
        _mint(to, amount);
    }
}
