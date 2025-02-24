// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "hardhat/console.sol";  // For debugging/logging
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * SilverbacksNFT:
 * Each token represents a $100 (or configurable) bill.
 * The NFT includes per-token metadata handling and a burn function.
 */
contract SilverbacksNFT is ERC721Enumerable, Ownable {
    // Mapping from tokenId to face value in stablecoin units (e.g., 100 for $100).
    mapping (uint256 => uint256) public faceValue;
    // Mapping from tokenId to its metadata URI.
    mapping (uint256 => string) private _tokenURIs;
    // Base URI fallback (if no per-token metadata is set).
    string private _baseTokenURI;

    // The vault (main contract) can mint and burn tokens.
    address public vaultContract;

    event MintedSilverback(uint256 indexed tokenId, address indexed owner, uint256 value);
    event BurnedSilverback(uint256 indexed tokenId, address indexed burner);

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
        // Optionally initialize base URI here.
    }

    function setVaultContract(address _vaultContract) external onlyOwner {
        vaultContract = _vaultContract;
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    /**
     * Override tokenURI to return the per-token metadata URI if set,
     * otherwise fallback to the base URI concatenated with tokenId.
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        string memory _tokenURI = _tokenURIs[tokenId];
        if (bytes(_tokenURI).length > 0) {
            return _tokenURI;
        }
        string memory base = _baseTokenURI;
        return bytes(base).length > 0 ? string(abi.encodePacked(base, uint2str(tokenId))) : "";
    }

    /**
     * Helper function: converts uint256 to string.
     */
    function uint2str(uint256 _i) internal pure returns (string memory str) {
        if (_i == 0) { return "0"; }
        uint256 j = _i;
        uint256 length;
        while (j != 0) { length++; j /= 10; }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        j = _i;
        while (j != 0) {
            bstr[--k] = bytes1(uint8(48 + j % 10));
            j /= 10;
        }
        str = string(bstr);
    }

    /**
     * Mint a new Silverback NFT with an associated metadata URI.
     * Can only be called by the contract owner or the designated vault contract.
     */
    function mintNote(
        address to,
        uint256 tokenId,
        uint256 value,
        string memory metadataURI
    ) external {
        console.log("SilverbacksNFT.mintNote called by: %s", msg.sender);
        console.log("Parameters: to = %s, tokenId = %s, value = %s", to, tokenId, value);
        require(msg.sender == owner() || msg.sender == vaultContract, "Not authorized to mint");
        _safeMint(to, tokenId);
        faceValue[tokenId] = value;
        _tokenURIs[tokenId] = metadataURI;
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
        delete _tokenURIs[tokenId];
        console.log("NFT burned: tokenId = %s", tokenId);
        emit BurnedSilverback(tokenId, msg.sender);
    }

    // --- The following functions are required overrides for ERC721Enumerable ---

    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal
        override(ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
