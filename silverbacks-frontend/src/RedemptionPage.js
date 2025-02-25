import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "react-router-dom";
import chains from "./chains.json";
import NFTCard from "./NFTCard";

// Minimal ABI snippets:
const stableCoinABI = ["function balanceOf(address) view returns (uint256)"];
const nftABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function faceValue(uint256 tokenId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)" // <-- Added function signature
];
const vaultABI = [
  "function redeem(uint256 tokenId) external",
  "function redeemWithAuth(uint256 tokenId, bytes signature) external",
  "function redeemTo(uint256 tokenId, bytes signature) external",
  "function claimNFT(uint256 tokenId, bytes signature) external"
];

const RedemptionPage = ({ currentAccount }) => {
  const [searchParams] = useSearchParams();
  const pk = searchParams.get("pk") || "";
  const urlAddress = searchParams.get("address") || "";
  const [ownerAddress, setOwnerAddress] = useState("");
  const [redeemNfts, setRedeemNfts] = useState([]);
  const [myNfts, setMyNFTs] = useState([]);
  const [logMessages, setLogMessages] = useState([]);
  const [contractAddresses, setContractAddresses] = useState(null);
  const [erc20Balance, setErc20Balance] = useState(null);

  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  useEffect(() => {
    if (pk && ethers.utils.isHexString(pk, 32)) {
      try {
        const wallet = new ethers.Wallet(pk);
        setOwnerAddress(wallet.address);
        log("Redeeming NFTs for address: " + wallet.address);
      } catch (error) {
        log("Error creating wallet from provided key: " + error.message);
      }
    } else if (urlAddress && ethers.utils.isAddress(urlAddress)) {
      setOwnerAddress(urlAddress);
      log("Displaying NFTs for address: " + urlAddress + " (redeem disabled)");
    } else {
      log("No valid wallet address provided in URL. Please add ?address=YOUR_WALLET_ADDRESS");
    }
  }, [pk, urlAddress]);

  useEffect(() => {
    async function loadContractAddresses() {
      if (window.ethereum) {
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const network = await provider.getNetwork();
          const chainIdHex = "0x" + network.chainId.toString(16);
          if (chains[chainIdHex] && chains[chainIdHex].contracts) {
            setContractAddresses(chains[chainIdHex].contracts);
            log("Loaded contract addresses for chain " + chainIdHex);
          } else {
            log("Contracts not defined for chain " + chainIdHex);
          }
        } catch (error) {
          log("Error loading contract addresses: " + error.message);
        }
      }
    }
    loadContractAddresses();
  }, []);

  const loadERC20Balance = async () => {
    if (!currentAccount || !contractAddresses) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const stableCoinContract = new ethers.Contract(
        contractAddresses.stableCoin,
        stableCoinABI,
        provider
      );
      const balance = await stableCoinContract.balanceOf(currentAccount);
      setErc20Balance(ethers.utils.formatEther(balance));
      log("ERC20 balance of connected wallet: " + ethers.utils.formatEther(balance));
    } catch (err) {
      log("Error loading ERC20 balance: " + err.message);
    }
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadERC20Balance();
    }
  }, [currentAccount, contractAddresses]);

  const loadRedeemNFTs = async () => {
    if (!ownerAddress || !window.ethereum || !contractAddresses) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const nftContract = new ethers.Contract(
        contractAddresses.silverbacksNFT,
        nftABI,
        provider
      );
      const count = await nftContract.balanceOf(ownerAddress);
      const nftData = [];
      for (let i = 0; i < count.toNumber(); i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(ownerAddress, i);
        const faceVal = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`Redeem Section - Token ID ${tokenId} metadata URI: ${tokenURI}`);
        let metadata = {};
        try {
          const response = await fetch(
            "https://silverbacksipfs.online/ipfs/" + tokenURI.slice(7)
          );
          metadata = await response.json();
        } catch (err) {
          log("Error fetching metadata for token " + tokenId + ": " + err.message);
        }
        nftData.push({
          tokenId: tokenId.toString(),
          faceValue: faceVal.toString(),
          tokenURI,
          image: metadata.image || null,
          imageBack: metadata.properties ? metadata.properties.imageBack : null,
          name: metadata.name || "",
          description: metadata.description || "",
        });
      }
      setRedeemNfts(nftData);
      if (nftData.length === 0) {
        log("No redeemable NFTs found for address " + ownerAddress);
      }
    } catch (error) {
      log("Error loading redeem NFTs: " + error.message);
    }
  };

  useEffect(() => {
    if (ownerAddress && contractAddresses) {
      loadRedeemNFTs();
    }
  }, [ownerAddress, contractAddresses]);

  const loadMyNFTs = async () => {
    if (!currentAccount || !window.ethereum || !contractAddresses) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const nftContract = new ethers.Contract(
        contractAddresses.silverbacksNFT,
        nftABI,
        provider
      );
      const count = await nftContract.balanceOf(currentAccount);
      const nftData = [];
      for (let i = 0; i < count.toNumber(); i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(currentAccount, i);
        const faceVal = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`My Wallet - Token ID ${tokenId} metadata URI: ${tokenURI}`);
        let metadata = {};
        try {
          const response = await fetch(
            "https://silverbacksipfs.online/ipfs/" + tokenURI.slice(7)
          );
          metadata = await response.json();
        } catch (err) {
          log("Error fetching metadata for token " + tokenId + ": " + err.message);
        }
        nftData.push({
          tokenId: tokenId.toString(),
          faceValue: faceVal.toString(),
          tokenURI,
          image: metadata.image || null,
          imageBack: metadata.properties ? metadata.properties.imageBack : null,
          name: metadata.name || "",
          description: metadata.description || "",
        });
      }
      setMyNFTs(nftData);
      if (nftData.length === 0) {
        log("No NFTs found for connected wallet " + currentAccount);
      }
    } catch (error) {
      log("Error loading connected wallet NFTs: " + error.message);
    }
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadMyNFTs();
    }
  }, [currentAccount, contractAddresses]);

  // Redeem functions (unchanged)
  const handleRedeemTo = async (tokenId) => {
    if (!currentAccount) {
      alert("Please connect your wallet using the header.");
      return;
    }
    if (!pk || !ethers.utils.isHexString(pk, 32)) {
      alert("No valid private key available.");
      return;
    }
    try {
      const message = ethers.utils.solidityKeccak256(["string", "uint256"], ["Redeem:", tokenId]);
      const messageHashBytes = ethers.utils.arrayify(message);
      const redeemerWallet = new ethers.Wallet(pk);
      const signature = await redeemerWallet.signMessage(messageHashBytes);
      log("Signature for redeeming tokenId " + tokenId + ": " + signature);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      const tx = await vaultContract.redeemTo(tokenId, signature);
      log("RedeemTo transaction submitted for tokenId " + tokenId);
      await tx.wait();
      log("RedeemTo transaction confirmed for tokenId " + tokenId);
      loadRedeemNFTs();
    } catch (error) {
      log("Error during redeemTo: " + error.message);
    }
  };

  const handleClaimNFT = async (tokenId) => {
    if (!currentAccount) {
      alert("Please connect your wallet using the header.");
      return;
    }
    if (!pk || !ethers.utils.isHexString(pk, 32)) {
      alert("No valid private key available.");
      return;
    }
    try {
      const message = ethers.utils.solidityKeccak256(["string", "uint256"], ["Claim:", tokenId]);
      const messageHashBytes = ethers.utils.arrayify(message);
      const redeemerWallet = new ethers.Wallet(pk);
      const signature = await redeemerWallet.signMessage(messageHashBytes);
      log("Signature for claiming tokenId " + tokenId + ": " + signature);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      const tx = await vaultContract.claimNFT(tokenId, signature);
      log("ClaimNFT transaction submitted for tokenId " + tokenId);
      await tx.wait();
      log("ClaimNFT transaction confirmed for tokenId " + tokenId);
      loadRedeemNFTs();
    } catch (error) {
      log("Error during claimNFT: " + error.message);
    }
  };

  const handleRedeem = async (tokenId) => {
    if (!currentAccount) {
      alert("Please connect your wallet using the header.");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      log("Redeeming NFT tokenId " + tokenId + " for stablecoins...");
      const tx = await vaultContract.redeem(tokenId);
      await tx.wait();
      log("Redeem transaction confirmed for tokenId " + tokenId);
      loadMyNFTs();
      loadERC20Balance();
    } catch (error) {
      log("Error during redeem: " + error.message);
    }
  };

  const handleSendNFT = async (tokenId) => {
    if (!currentAccount) {
      alert("Please connect your wallet using the header.");
      return;
    }
    const recipient = prompt("Enter recipient address:");
    if (!recipient || !ethers.utils.isAddress(recipient)) {
      alert("Invalid Ethereum address.");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, signer);
      log("Transferring NFT tokenId " + tokenId + " to " + recipient + "...");
      const tx = await nftContract["safeTransferFrom(address,address,uint256)"](currentAccount, recipient, tokenId);
      await tx.wait();
      log("Transfer transaction confirmed for tokenId " + tokenId);
      loadMyNFTs();
    } catch (err) {
      log("Error transferring NFT: " + err.message);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          log("Account changed to: " + accounts[0]);
        }
      });
      window.ethereum.on("chainChanged", (_chainId) => {
        log("Chain changed to: " + _chainId);
        window.location.reload();
      });
    }
  }, []);

  return (
    <div className="container">
      <h1 className="center-align">Redemption Page</h1>
      {contractAddresses && (
        <div className="card-panel teal lighten-4">
          <p>
            <strong>ERC20 Token Address:</strong> {contractAddresses.stableCoin}
          </p>
          <p>
            <strong>ERC721 Token Address:</strong> {contractAddresses.silverbacksNFT}
          </p>
          {currentAccount && erc20Balance !== null && (
            <p>
              <strong>Your ERC20 Balance:</strong> {erc20Balance} tokens
            </p>
          )}
        </div>
      )}

      {/* Section for Redeeming NFTs (based on URL ownerAddress) */}
      {ownerAddress && (
        <div className="card">
          <div className="card-content">
            <span className="card-title">Redeeming NFTs for Address: {ownerAddress}</span>
            {redeemNfts.length > 0 ? (
              <div className="row">
                {redeemNfts.map((n) => (
                  <NFTCard
                    key={n.tokenId}
                    nft={n}
                    pk={pk}
                    handleRedeemTo={handleRedeemTo}
                    handleClaimNFT={handleClaimNFT}
                    handleRedeem={handleRedeem}
                    handleSendNFT={handleSendNFT}
                  />
                ))}
              </div>
            ) : (
              <p>No redeemable NFTs found for address {ownerAddress}</p>
            )}
          </div>
        </div>
      )}

      {/* Section for Connected Wallet's NFTs */}
      {currentAccount && (
        <div className="card">
          <div className="card-content">
            <span className="card-title">Your Connected Wallet NFTs</span>
            {myNfts.length > 0 ? (
              <div className="row">
                {myNfts.map((n) => (
                  <NFTCard
                    key={n.tokenId}
                    nft={n}
                    pk={""} // For connected wallet NFTs, redemption buttons can be shown or hidden as desired.
                    handleRedeemTo={handleRedeemTo}
                    handleClaimNFT={handleClaimNFT}
                    handleRedeem={handleRedeem}
                    handleSendNFT={handleSendNFT}
                  />
                ))}
              </div>
            ) : (
              <p>No NFTs found in your connected wallet ({currentAccount})</p>
            )}
          </div>
        </div>
      )}

      {/* Debug Log */}
      <div className="card-panel grey darken-3" style={{ color: "white", marginTop: "2rem" }}>
        <h5>Debug Log</h5>
        {logMessages.map((msg, idx) => (
          <p key={idx} style={{ fontFamily: "monospace", margin: "0.2rem 0" }}>
            {msg}
          </p>
        ))}
      </div>
    </div>
  );
};

export default RedemptionPage;
