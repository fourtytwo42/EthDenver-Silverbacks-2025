// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MyERC20Token
/// @notice A generic ERC20 token that mints an initial supply to the deployer.
contract MyERC20Token is ERC20 {
    constructor(
        string memory name, 
        string memory symbol, 
        uint256 initialSupply
    ) ERC20(name, symbol) {
        // Mint the initial supply (in 18-decimal base units) to the deployer.
        _mint(msg.sender, initialSupply);
    }
}
