// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "hardhat/console.sol";  // For debugging/logging
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * SilverbacksNFT:
 * Each token represents a $100 (or configurable) bill.
 * The NFT includes metadata handling and a burn function.
 */
contract SilverbacksNFT is ERC721, Ownable {

    // Mapping from tokenId to face value in stablecoin units (e.g., 100 for $100).
    mapping (uint256 => uint256) public faceValue;
    string private _baseTokenURI;

    // The vault (main contract) can mint and burn tokens.
    address public vaultContract;

    event MintedSilverback(uint256 indexed tokenId, address indexed owner, uint256 value);
    event BurnedSilverback(uint256 indexed tokenId, address indexed burner);

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
        // Initialize base URI if needed.
    }

    function setVaultContract(address _vaultContract) external onlyOwner {
        vaultContract = _vaultContract;
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * Mint a new Silverback NFT.
     * Can only be called by the contract owner or the designated vault contract.
     */
    function mintNote(address to, uint256 tokenId, uint256 value) external {
        console.log("SilverbacksNFT.mintNote called by: %s", msg.sender);
        console.log("Parameters: to = %s, tokenId = %s, value = %s", to, tokenId, value);

        require(msg.sender == owner() || msg.sender == vaultContract, "Not authorized to mint");
        _safeMint(to, tokenId);
        faceValue[tokenId] = value;
        console.log("NFT minted: tokenId = %s, face value = %s", tokenId, value);
        emit MintedSilverback(tokenId, to, value);
    }

    /**
     * Burn the NFT.
     * Can be called by the token owner or the vault contract.
     */
    function burn(uint256 tokenId) external {
        console.log("SilverbacksNFT.burn called by: %s, tokenId: %s", msg.sender, tokenId);
        require(_isApprovedOrOwner(msg.sender, tokenId) || msg.sender == vaultContract, "Not authorized to burn");
        _burn(tokenId);
        delete faceValue[tokenId];
        console.log("NFT burned: tokenId = %s", tokenId);
        emit BurnedSilverback(tokenId, msg.sender);
    }
}
