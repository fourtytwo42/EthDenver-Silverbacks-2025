// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MultiTokenNFT (King Louis NFT)
/// @notice An ERC721 NFT contract that represents a deposit of multiple tokens (King Louis deposit).
/// Designed to align with the SilverbacksNFT interface for uniform ABI usage.
contract MultiTokenNFT is ERC721Enumerable, Ownable {
    // Mapping from tokenId to face value (for King Louis NFTs, this can be a fixed dummy value)
    mapping (uint256 => uint256) public faceValue;
    // Per-token metadata URI.
    mapping (uint256 => string) private _tokenURIs;
    // Base URI fallback.
    string private _baseTokenURI;
    // Vault contract allowed to mint and burn NFTs.
    address public vaultContract;

    event MintedNote(uint256 indexed tokenId, address indexed owner, uint256 value);
    event BurnedNote(uint256 indexed tokenId, address indexed burner);

    constructor(
        string memory name, 
        string memory symbol
    ) ERC721(name, symbol) {}

    function setVaultContract(address _vaultContract) external onlyOwner {
        vaultContract = _vaultContract;
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        string memory _tokenURI = _tokenURIs[tokenId];
        if (bytes(_tokenURI).length > 0) {
            return _tokenURI;
        }
        string memory base = _baseTokenURI;
        return bytes(base).length > 0 ? string(abi.encodePacked(base, uint2str(tokenId))) : "";
    }

    // Helper function to convert uint256 to string.
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

    /// @notice Mint a new NFT with the specified value and metadata URI.
    /// @dev Can only be called by the owner or the vault contract.
    function mintNote(
        address to,
        uint256 tokenId,
        uint256 value,
        string memory metadataURI
    ) external {
        require(msg.sender == owner() || msg.sender == vaultContract, "Not authorized to mint");
        _safeMint(to, tokenId);
        faceValue[tokenId] = value;
        _tokenURIs[tokenId] = metadataURI;
        emit MintedNote(tokenId, to, value);
    }

    /// @notice Burn an NFT.
    /// @dev Can be called by the NFT owner (or approved) or by the vault.
    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(msg.sender, tokenId) || msg.sender == vaultContract, "Not authorized to burn");
        _burn(tokenId);
        delete faceValue[tokenId];
        delete _tokenURIs[tokenId];
        emit BurnedNote(tokenId, msg.sender);
    }

    // --- Required overrides for ERC721Enumerable ---
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal override(ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @notice Allows the vault to transfer the NFT to a new owner.
    modifier onlyVault() {
        require(msg.sender == vaultContract, "Not authorized: Only vault");
        _;
    }
    function claimTransfer(address from, address to, uint256 tokenId) external onlyVault {
        _safeTransfer(from, to, tokenId, "");
    }
}
