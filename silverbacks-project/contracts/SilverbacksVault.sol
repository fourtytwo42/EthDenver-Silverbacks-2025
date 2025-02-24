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
 *
 * NOTE on decimals:
 *   - The MyStableCoin is assumed to have 18 decimals (standard ERC-20).
 *   - Each "Silverback" NFT is notionally worth $100, so in base ERC-20 units,
 *     that is 100 * 10^18 = 100e18. We'll call this NOTE_SIZE.
 *   - We store the NFT's faceValue as just "100" (an integer) so the tests can
 *     compare to 100 directly. But when actually transferring stablecoins, we
 *     multiply that faceValue by 1e18 to handle decimals correctly.
 */
contract SilverbacksVault is Ownable {

    // The underlying stablecoin contract (assumed 18 decimals).
    IERC20 public stableCoin;

    // The Silverbacks NFT contract that this vault mints/burns.
    SilverbacksNFT public silverbacksNFT;

    // Next token ID to use when minting new NFTs.
    uint256 public nextTokenId;

    // Each "silverback" represents $100 in stableCoin, i.e. 100 * 1e18 base units.
    uint256 private constant NOTE_SIZE = 100 * 10**18;

    event Deposited(address indexed depositor, uint256 depositAmount, uint256 mintedCount, uint256 remainder);
    event Redeemed(address indexed redeemer, uint256 tokenId, uint256 faceValue);

    constructor(address _stableCoin, address _silverbacksNFT) {
        stableCoin = IERC20(_stableCoin);
        silverbacksNFT = SilverbacksNFT(_silverbacksNFT);
        nextTokenId = 0;
    }

    /**
     * Deposit stablecoins in multiples of $100. If depositAmount is not a multiple
     * of $100 * 1e18, the remainder is refunded to the user.
     *
     * Examples:
     *  - If user deposits 102 * 1e18, that's "102 tokens". We mint 1 NFT
     *    (for 100 tokens) and refund 2 tokens.
     */
    function deposit(uint256 depositAmount) external {
        console.log("SilverbacksVault.deposit called by: %s", msg.sender);
        console.log("Deposit amount: %s base units (i.e. 1e18 = 1 token)", depositAmount);

        require(depositAmount >= NOTE_SIZE, "Minimum deposit is $100 worth of tokens");

        // 1. Transfer stablecoins from user to this contract
        require(
            stableCoin.transferFrom(msg.sender, address(this), depositAmount),
            "Transfer failed"
        );

        // 2. Figure out how many full "100 USD notes" we can mint
        uint256 numFullNotes = depositAmount / NOTE_SIZE;
        uint256 remainder    = depositAmount % NOTE_SIZE;

        // 3. Refund remainder if any
        if (remainder > 0) {
            console.log("Refunding remainder: %s base units", remainder);
            require(
                stableCoin.transfer(msg.sender, remainder),
                "Refund transfer failed"
            );
        }

        // 4. Mint an NFT for each full $100
        for (uint256 i = 0; i < numFullNotes; i++) {
            uint256 tokenId = nextTokenId;
            nextTokenId++;
            console.log("Minting NFT with tokenId: %s for depositor: %s", tokenId, msg.sender);

            // The NFT's faceValue is stored as "100" (no decimals).
            silverbacksNFT.mintNote(msg.sender, tokenId, 100);
        }

        emit Deposited(msg.sender, depositAmount, numFullNotes, remainder);
    }

    /**
     * Redeem an NFT for stablecoins. The NFT must belong to the caller.
     * We burn the NFT and transfer the stablecoins.
     */
    function redeem(uint256 tokenId) external {
        console.log(
            "SilverbacksVault.redeem called by: %s for tokenId: %s",
            msg.sender,
            tokenId
        );

        // 1. Verify the caller owns the NFT
        require(silverbacksNFT.ownerOf(tokenId) == msg.sender, "Not NFT owner");

        // 2. Look up the integer faceValue in the NFT (e.g., 100)
        uint256 nominalValue = silverbacksNFT.faceValue(tokenId);
        console.log("Redeeming NFT with faceValue: %s (in 'whole tokens')", nominalValue);

        // 3. Burn the NFT
        silverbacksNFT.burn(tokenId);

        // 4. Transfer the stablecoins. Multiply by 1e18 because
        //    'nominalValue=100' => '100 * 1e18' actual base units.
        uint256 actualAmount = nominalValue * 10**18;
        require(
            stableCoin.transfer(msg.sender, actualAmount),
            "Stablecoin transfer failed"
        );

        emit Redeemed(msg.sender, tokenId, nominalValue);
    }
}
