// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./SilverbacksNFT.sol";

/**
 * SilverbacksVault:
 * - Holds all stablecoins.
 * - Handles deposit, NFT batch minting, and NFT redemption (burn + stablecoin withdrawal).
 */
contract SilverbacksVault is Ownable {

    IERC20 public stableCoin;
    SilverbacksNFT public silverbacksNFT;

    // Next token ID
    uint256 public nextTokenId;

    event Deposited(address indexed depositor, uint256 depositAmount, uint256 mintedCount, uint256 remainder);
    event Redeemed(address indexed redeemer, uint256 tokenId, uint256 faceValue);

    constructor(address _stableCoin, address _silverbacksNFT) {
        stableCoin = IERC20(_stableCoin);
        silverbacksNFT = SilverbacksNFT(_silverbacksNFT);
    }

    /**
     * Deposit stablecoins in multiples of $100. 
     * If depositAmount is not multiple of 100, remainder is refunded to user.
     */
    function deposit(uint256 depositAmount) external {
        require(depositAmount >= 100, "Minimum deposit is $100");
        // Transfer stablecoins from user to this contract
        stableCoin.transferFrom(msg.sender, address(this), depositAmount);

        uint256 numFullNotes = depositAmount / 100;  // e.g. deposit=102 => 1
        uint256 remainder = depositAmount % 100;     // e.g. deposit=102 => remainder=2

        // If there's a remainder, refund it
        if (remainder > 0) {
            stableCoin.transfer(msg.sender, remainder);
        }

        // Mint an NFT for each full $100
        for (uint256 i = 0; i < numFullNotes; i++) {
            uint256 tokenId = nextTokenId;
            nextTokenId++;
            silverbacksNFT.mintNote(msg.sender, tokenId, 100);
        }

        emit Deposited(msg.sender, depositAmount, numFullNotes, remainder);
    }

    /**
     * Burn the NFT and receive the face value in stablecoin.
     */
    function redeem(uint256 tokenId) external {
        // Verify ownership of the NFT
        require(silverbacksNFT.ownerOf(tokenId) == msg.sender, "Not owner of the NFT");
        uint256 value = silverbacksNFT.faceValue(tokenId);
        // Burn the NFT (calls burn function in SilverbacksNFT)
        silverbacksNFT.burn(tokenId);

        // Transfer stablecoins to user
        stableCoin.transfer(msg.sender, value);

        emit Redeemed(msg.sender, tokenId, value);
    }
}