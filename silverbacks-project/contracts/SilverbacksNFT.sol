// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * SilverbacksNFT: Each token represents a $100 face value note, or a user-defined value.
 * The 'faceValue' can be set at mint time. The main vault contract can burn these.
 */
contract SilverbacksNFT is ERC721, Ownable {

    // Mapping tokenId -> face value in stablecoin terms (e.g., 100 = $100).
    mapping (uint256 => uint256) public faceValue;
    string private _baseTokenURI;

    // The vault (main contract) can burn tokens.
    address public vaultContract;

    event MintedSilverback(uint256 indexed tokenId, address indexed owner, uint256 value);
    event BurnedSilverback(uint256 indexed tokenId, address indexed burner);

    constructor(string memory name, string memory symbol) ERC721(name, symbol) {
        // Set an initial base URI if needed
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
     * Mint function that can only be called by the vault contract or owner.
     */
    function mintNote(address to, uint256 tokenId, uint256 value) external {
        require(msg.sender == owner() || msg.sender == vaultContract, "Not authorized to mint");
        _safeMint(to, tokenId);
        faceValue[tokenId] = value;
        emit MintedSilverback(tokenId, to, value);
    }

    /**
     * Burn function, can be called by the vault contract or the token owner.
     */
    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(msg.sender, tokenId) || msg.sender == vaultContract, "Not authorized to burn");
        _burn(tokenId);
        delete faceValue[tokenId];
        emit BurnedSilverback(tokenId, msg.sender);
    }
}