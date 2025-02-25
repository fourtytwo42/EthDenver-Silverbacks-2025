// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "hardhat/console.sol";  // For debugging/logging
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./SilverbacksNFT.sol";
// NEW: Import ECDSA for signature recovery.
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * SilverbacksVault:
 * - Handles deposits of stablecoins and mints NFTs accordingly.
 * - Manages NFT redemption by burning NFTs and releasing locked stablecoins.
 *
 * NOTE on decimals:
 *   - The MyStableCoin is assumed to have 18 decimals (standard ERC-20).
 *   - Each "Silverback" NFT is notionally worth $100, i.e. 100 * 10^18.
 *     We call this value NOTE_SIZE.
 *   - The NFT’s faceValue is stored as “100” (no decimals). When transferring
 *     stablecoins the faceValue is multiplied by 1e18.
 *
 * New Functions Added:
 *   - depositTo and batchDeposit: see below.
 *   - redeemWithAuth: allows a third party (paying gas) to redeem an NFT on behalf of the owner,
 *     if the owner provides a signature (from the private key passed in via the redemption page).
 */
contract SilverbacksVault is Ownable {
    using ECDSA for bytes32;

    // The underlying stablecoin contract (assumed 18 decimals).
    IERC20 public stableCoin;
    // The Silverbacks NFT contract that this vault mints/burns.
    SilverbacksNFT public silverbacksNFT;
    // Next token ID to use when minting new NFTs.
    uint256 public nextTokenId;
    // Each "silverback" represents $100 in stableCoin (i.e. 100 * 1e18).
    uint256 private constant NOTE_SIZE = 100 * 10**18;

    event Deposited(address indexed depositor, uint256 depositAmount, uint256 mintedCount, uint256 remainder);
    event BatchDeposited(address indexed depositor, uint256 totalAmount, uint256 mintedCount);
    event Redeemed(address indexed redeemer, uint256 tokenId, uint256 faceValue);

    constructor(address _stableCoin, address _silverbacksNFT) {
        stableCoin = IERC20(_stableCoin);
        silverbacksNFT = SilverbacksNFT(_silverbacksNFT);
        nextTokenId = 0;
    }

    /**
     * Deposit stablecoins in multiples of $100 along with a metadata URI.
     * If depositAmount is not a multiple of NOTE_SIZE, the remainder is refunded.
     * NFTs are minted to msg.sender.
     */
    function deposit(uint256 depositAmount, string memory metadataURI) external {
        console.log("SilverbacksVault.deposit called by: %s", msg.sender);
        console.log("Deposit amount: %s base units", depositAmount);

        require(depositAmount >= NOTE_SIZE, "Minimum deposit is $100 worth of tokens");

        // Transfer stablecoins from the caller to this contract.
        require(
            stableCoin.transferFrom(msg.sender, address(this), depositAmount),
            "Transfer failed"
        );

        // Calculate full $100 notes and refund any remainder.
        uint256 numFullNotes = depositAmount / NOTE_SIZE;
        uint256 remainder    = depositAmount % NOTE_SIZE;

        if (remainder > 0) {
            console.log("Refunding remainder: %s", remainder);
            require(
                stableCoin.transfer(msg.sender, remainder),
                "Refund transfer failed"
            );
        }

        // Mint an NFT for each full $100.
        for (uint256 i = 0; i < numFullNotes; i++) {
            uint256 tokenId = nextTokenId;
            nextTokenId++;
            console.log("Minting NFT with tokenId: %s for depositor: %s", tokenId, msg.sender);
            silverbacksNFT.mintNote(msg.sender, tokenId, 100, metadataURI);
        }

        emit Deposited(msg.sender, depositAmount, numFullNotes, remainder);
    }

    /**
     * depositTo:
     * Deposits stablecoins (from the caller) and mints an NFT to a specified recipient.
     * The depositAmount must be at least $100, and for simplicity, this function
     * accepts exactly a $100 deposit. Any excess is refunded.
     */
    function depositTo(address recipient, uint256 depositAmount, string memory metadataURI) external {
        console.log("SilverbacksVault.depositTo called by: %s, recipient: %s", msg.sender, recipient);
        require(depositAmount >= NOTE_SIZE, "Minimum deposit is $100 worth of tokens");

        require(
            stableCoin.transferFrom(msg.sender, address(this), depositAmount),
            "Transfer failed"
        );

        uint256 numFullNotes = depositAmount / NOTE_SIZE;
        uint256 remainder    = depositAmount % NOTE_SIZE;

        if (remainder > 0) {
            console.log("Refunding remainder: %s", remainder);
            require(
                stableCoin.transfer(msg.sender, remainder),
                "Refund transfer failed"
            );
        }

        // For depositTo we require exactly one NFT minted per call.
        require(numFullNotes == 1, "depositTo accepts exactly a $100 deposit");
        uint256 tokenId = nextTokenId;
        nextTokenId++;
        silverbacksNFT.mintNote(recipient, tokenId, 100, metadataURI);

        emit Deposited(recipient, depositAmount, 1, remainder);
    }

    /**
     * batchDeposit:
     * Batch deposits for minting NFTs to multiple recipients.
     * Each entry in the arrays represents a deposit of exactly $100.
     * The caller must have approved (NOTE_SIZE * recipients.length) stablecoins.
     * Arrays `recipients` and `metadataURIs` must be the same length.
     */
    function batchDeposit(address[] calldata recipients, string[] calldata metadataURIs) external {
        require(recipients.length == metadataURIs.length, "Array length mismatch");
        uint256 count = recipients.length;
        uint256 totalRequired = count * NOTE_SIZE;
        require(
            stableCoin.transferFrom(msg.sender, address(this), totalRequired),
            "Transfer failed"
        );

        for (uint256 i = 0; i < count; i++) {
            silverbacksNFT.mintNote(recipients[i], nextTokenId, 100, metadataURIs[i]);
            nextTokenId++;
        }

        emit BatchDeposited(msg.sender, totalRequired, count);
    }

    /**
     * redeem:
     * Burns an NFT owned by the caller and returns the corresponding stablecoins.
     * (This version is used when the NFT owner is paying gas themselves.)
     */
    function redeem(uint256 tokenId) external {
        console.log("SilverbacksVault.redeem called by: %s for tokenId: %s", msg.sender, tokenId);

        // Verify NFT ownership.
        require(silverbacksNFT.ownerOf(tokenId) == msg.sender, "Not NFT owner");

        // Burn the NFT.
        silverbacksNFT.burn(tokenId);

        // Transfer the stablecoins (multiply by 1e18).
        uint256 actualAmount = 100 * 10**18;
        require(
            stableCoin.transfer(msg.sender, actualAmount),
            "Stablecoin transfer failed"
        );

        emit Redeemed(msg.sender, tokenId, 100);
    }

    /**
     * redeemWithAuth:
     * Allows anyone (paying gas) to redeem an NFT on behalf of its owner.
     * The NFT owner must have signed the message "Redeem:" concatenated with the tokenId.
     * The signature is verified against the NFT owner’s address.
     * The redeemed stablecoins are then transferred to the NFT owner.
     */
    function redeemWithAuth(uint256 tokenId, bytes calldata signature) external {
        address nftOwner = silverbacksNFT.ownerOf(tokenId);
        // Construct the message hash. (Make sure the same message is signed off‐chain.)
        bytes32 messageHash = keccak256(abi.encodePacked("Redeem:", tokenId));
        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(messageHash);
        address recovered = ethSignedMessageHash.recover(signature);
        require(recovered == nftOwner, "Invalid signature");

        // Burn the NFT.
        silverbacksNFT.burn(tokenId);

        // Transfer stablecoins (each NFT is $100).
        uint256 actualAmount = 100 * 10**18;
        require(
            stableCoin.transfer(nftOwner, actualAmount),
            "Stablecoin transfer failed"
        );

        emit Redeemed(nftOwner, tokenId, 100);
    }
}
