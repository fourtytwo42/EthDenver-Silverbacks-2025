// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "hardhat/console.sol";  // For debugging/logging
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./SilverbacksNFT.sol";

/**
 * SilverbacksVault:
 * - Handles deposits of stablecoins and mints batch NFTs accordingly.
 * - Manages NFT redemption by burning NFTs and releasing locked stablecoins.
 */
contract SilverbacksVault is Ownable {

    IERC20 public stableCoin;
    SilverbacksNFT public silverbacksNFT;

    // Next token ID for minted NFTs.
    uint256 public nextTokenId;

    event Deposited(address indexed depositor, uint256 depositAmount, uint256 mintedCount, uint256 remainder);
    event Redeemed(address indexed redeemer, uint256 tokenId, uint256 faceValue);

    constructor(address _stableCoin, address _silverbacksNFT) {
        stableCoin = IERC20(_stableCoin);
        silverbacksNFT = SilverbacksNFT(_silverbacksNFT);
        nextTokenId = 0;
    }

    /**
     * Deposit stablecoins in multiples of $100.
     * If depositAmount is not a multiple of 100, the remainder is refunded to the user.
     */
    function deposit(uint256 depositAmount) external {
        console.log("SilverbacksVault.deposit called by: %s", msg.sender);
        console.log("Deposit amount: %s", depositAmount);

        require(depositAmount >= 100, "Minimum deposit is $100");
        // Transfer stablecoins from user to this contract
        require(stableCoin.transferFrom(msg.sender, address(this), depositAmount), "Transfer failed");

        uint256 numFullNotes = depositAmount / 100;  // e.g., deposit 102 => 1 full note
        uint256 remainder = depositAmount % 100;     // e.g., deposit 102 => remainder 2

        if (remainder > 0) {
            console.log("Refunding remainder: %s", remainder);
            require(stableCoin.transfer(msg.sender, remainder), "Refund transfer failed");
        }

        // Mint an NFT for each full $100 note
        for (uint256 i = 0; i < numFullNotes; i++) {
            uint256 tokenId = nextTokenId;
            nextTokenId++;
            console.log("Minting NFT with tokenId: %s for depositor: %s", tokenId, msg.sender);
            silverbacksNFT.mintNote(msg.sender, tokenId, 100);
        }

        emit Deposited(msg.sender, depositAmount, numFullNotes, remainder);
    }

    /**
     * Redeem an NFT and receive the corresponding stablecoins.
     */
    function redeem(uint256 tokenId) external {
        console.log("SilverbacksVault.redeem called by: %s for tokenId: %s", msg.sender, tokenId);
        // Verify the redeemer is the owner of the NFT.
        require(silverbacksNFT.ownerOf(tokenId) == msg.sender, "Not NFT owner");
        uint256 value = silverbacksNFT.faceValue(tokenId);
        console.log("Redeeming NFT with face value: %s", value);
        // Burn the NFT (calls the burn function in SilverbacksNFT)
        silverbacksNFT.burn(tokenId);

        // Transfer stablecoins to user
        require(stableCoin.transfer(msg.sender, value), "Stablecoin transfer failed");

        emit Redeemed(msg.sender, tokenId, value);
    }
}
