// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MultiTokenNFT.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MultiTokenVault (King Louis Vault)
/// @notice A vault that accepts deposits in three ERC20 tokens (WBTC, WETH, WLTC)
/// and mints an NFT representing the deposit. When the NFT is redeemed, the same
/// amounts (0.05 WBTC, 0.5 WETH and 3 WLTC) are returned to the redeemer.
/// Functions are aligned with SilverbacksVault for uniform ABI usage.
contract MultiTokenVault is Ownable {
    using ECDSA for bytes32;

    // ERC20 tokens
    IERC20 public wbtc;
    IERC20 public weth;
    IERC20 public wltc;
    // The MultiToken NFT contract
    MultiTokenNFT public multiNFT;
    // Next token ID to use when minting new NFTs.
    uint256 public nextTokenId;

    // Fixed required amounts (in 18-decimal base units)
    uint256 public constant REQUIRED_WBTC = 5e16; // 0.05 * 1e18
    uint256 public constant REQUIRED_WETH = 5e17; // 0.5 * 1e18
    uint256 public constant REQUIRED_WLTC = 3e18;  // 3 * 1e18

    event Deposited(address indexed depositor, uint256 tokenId);
    event Redeemed(address indexed redeemer, uint256 tokenId);
    event ClaimedNFT(uint256 indexed tokenId, address indexed newOwner);

    constructor(
        address _wbtc,
        address _weth,
        address _wltc,
        address _multiNFT
    ) {
        wbtc = IERC20(_wbtc);
        weth = IERC20(_weth);
        wltc = IERC20(_wltc);
        multiNFT = MultiTokenNFT(_multiNFT);
        nextTokenId = 0;
    }

    /// @notice Deposit the fixed required amounts of tokens and mint an NFT to msg.sender.
    /// @param depositAmount Ignored parameter for interface compatibility.
    /// @param metadataURI The metadata URI for the NFT.
    function deposit(uint256 depositAmount, string memory metadataURI) external {
        // depositAmount is ignored since the required amounts are fixed.
        require(wbtc.transferFrom(msg.sender, address(this), REQUIRED_WBTC), "WBTC transfer failed");
        require(weth.transferFrom(msg.sender, address(this), REQUIRED_WETH), "WETH transfer failed");
        require(wltc.transferFrom(msg.sender, address(this), REQUIRED_WLTC), "WLTC transfer failed");

        uint256 tokenId = nextTokenId;
        nextTokenId++;

        // Mint NFT with fixed amounts; for King Louis NFTs, we set value to 0.
        multiNFT.mintNote(
            msg.sender,
            tokenId,
            0,
            metadataURI
        );
        emit Deposited(msg.sender, tokenId);
    }

    /// @notice Deposit tokens on behalf of a recipient.
    /// @param recipient The address to receive the NFT.
    /// @param depositAmount Ignored parameter for interface compatibility.
    /// @param metadataURI The metadata URI for the NFT.
    function depositTo(address recipient, uint256 depositAmount, string memory metadataURI) external {
        require(wbtc.transferFrom(msg.sender, address(this), REQUIRED_WBTC), "WBTC transfer failed");
        require(weth.transferFrom(msg.sender, address(this), REQUIRED_WETH), "WETH transfer failed");
        require(wltc.transferFrom(msg.sender, address(this), REQUIRED_WLTC), "WLTC transfer failed");

        uint256 tokenId = nextTokenId;
        nextTokenId++;

        multiNFT.mintNote(
            recipient,
            tokenId,
            0,
            metadataURI
        );
        emit Deposited(recipient, tokenId);
    }

    /// @notice Redeem an NFT and receive back the deposited tokens.
    function redeem(uint256 tokenId) external {
        require(multiNFT.ownerOf(tokenId) == msg.sender, "Not NFT owner");
        multiNFT.burn(tokenId);
        require(wbtc.transfer(msg.sender, REQUIRED_WBTC), "WBTC transfer failed");
        require(weth.transfer(msg.sender, REQUIRED_WETH), "WETH transfer failed");
        require(wltc.transfer(msg.sender, REQUIRED_WLTC), "WLTC transfer failed");
        emit Redeemed(msg.sender, tokenId);
    }

    /// @notice Redeem an NFT using an off-chain signature (tokens returned to NFT owner).
    function redeemWithAuth(uint256 tokenId, bytes calldata signature) external {
        address nftOwner = multiNFT.ownerOf(tokenId);
        bytes32 messageHash = keccak256(abi.encodePacked("Redeem:", tokenId));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedMessageHash.recover(signature);
        require(recovered == nftOwner, "Invalid signature");

        multiNFT.burn(tokenId);
        require(wbtc.transfer(nftOwner, REQUIRED_WBTC), "WBTC transfer failed");
        require(weth.transfer(nftOwner, REQUIRED_WETH), "WETH transfer failed");
        require(wltc.transfer(nftOwner, REQUIRED_WLTC), "WLTC transfer failed");
        emit Redeemed(nftOwner, tokenId);
    }

    /// @notice Redeem an NFT using an off-chain signature but send tokens to msg.sender.
    function redeemTo(uint256 tokenId, bytes calldata signature) external {
        address nftOwner = multiNFT.ownerOf(tokenId);
        bytes32 messageHash = keccak256(abi.encodePacked("Redeem:", tokenId));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedMessageHash.recover(signature);
        require(recovered == nftOwner, "Invalid signature");

        multiNFT.burn(tokenId);
        require(wbtc.transfer(msg.sender, REQUIRED_WBTC), "WBTC transfer failed");
        require(weth.transfer(msg.sender, REQUIRED_WETH), "WETH transfer failed");
        require(wltc.transfer(msg.sender, REQUIRED_WLTC), "WLTC transfer failed");
        emit Redeemed(msg.sender, tokenId);
    }

    /// @notice Claim the NFT (transfer it from the ephemeral owner to caller) using an off-chain signature.
    function claimNFT(uint256 tokenId, bytes calldata signature) external {
        address nftOwner = multiNFT.ownerOf(tokenId);
        bytes32 messageHash = keccak256(abi.encodePacked("Claim:", tokenId));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        address recovered = ethSignedMessageHash.recover(signature);
        require(recovered == nftOwner, "Invalid signature");

        multiNFT.claimTransfer(nftOwner, msg.sender, tokenId);
        emit ClaimedNFT(tokenId, msg.sender);
    }
}
