import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "react-router-dom";

// Replace with your deployed contract addresses:
const silverbacksNftAddress = "0xEb641123243b897201B7E1fB2052256B6E9e1f5a";
const vaultAddress = "0x2A314860Cc789D30E384369769e2C85b67939689";

// Minimal ABIs:
const nftABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function faceValue(uint256 tokenId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const vaultABI = [
  "function redeemWithAuth(uint256 tokenId, bytes signature) external",
  "function redeemTo(uint256 tokenId, bytes signature) external",
  "function claimNFT(uint256 tokenId, bytes signature) external"
];

function RedemptionPage() {
  const [searchParams] = useSearchParams();
  // Expect the private key to be passed as the "pk" query parameter
  const pk = searchParams.get("pk") || "";
  const [ownerAddress, setOwnerAddress] = useState("");
  const [nfts, setNfts] = useState([]);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [logMessages, setLogMessages] = useState([]);

  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  // Create a wallet instance from the provided private key (off‑chain)
  useEffect(() => {
    if (pk && ethers.utils.isHexString(pk, 32)) {
      try {
        const wallet = new ethers.Wallet(pk);
        setOwnerAddress(wallet.address);
        log("Redeeming NFTs for address: " + wallet.address);
      } catch (error) {
        log("Error creating wallet from provided key: " + error.message);
      }
    } else {
      log("No valid private key provided in URL. Please add ?pk=YOUR_PRIVATE_KEY");
    }
  }, [pk]);

  // Connect user’s wallet (for paying gas)
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask is not installed!");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setCurrentAccount(accounts[0]);
      log("User wallet connected: " + accounts[0]);
    } catch (err) {
      log("Error connecting wallet: " + err.message);
    }
  };

  // Load NFTs owned by the computed ownerAddress and fetch metadata from IPFS
  const loadNFTs = async () => {
    if (!ownerAddress || !window.ethereum) return;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const nftContract = new ethers.Contract(silverbacksNftAddress, nftABI, provider);
    try {
      const count = await nftContract.balanceOf(ownerAddress);
      const nftData = [];
      for (let i = 0; i < count.toNumber(); i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(ownerAddress, i);
        const faceVal = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        let metadata = {};
        try {
          // Fetch metadata JSON using the HTTPS gateway (adjust as needed)
          const response = await fetch("https://silverbacksipfs.online/ipfs/" + tokenURI.slice(7));
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
          description: metadata.description || ""
        });
      }
      setNfts(nftData);
      if (nftData.length === 0) {
        log("No NFTs found for address " + ownerAddress);
      }
    } catch (error) {
      log("Error loading NFTs: " + error.message);
    }
  };

  // Handler for redeeming to get stablecoins (burns NFT and sends stablecoins to connected wallet)
  const handleRedeemTo = async (tokenId) => {
    if (!pk || !ethers.utils.isHexString(pk, 32)) {
      alert("No valid private key available.");
      return;
    }
    if (!currentAccount) {
      alert("Please connect your wallet first.");
      return;
    }
    try {
      // Sign message "Redeem:" + tokenId
      const message = ethers.utils.solidityKeccak256(["string", "uint256"], ["Redeem:", tokenId]);
      const messageHashBytes = ethers.utils.arrayify(message);
      const redeemerWallet = new ethers.Wallet(pk);
      const signature = await redeemerWallet.signMessage(messageHashBytes);
      log("Signature for redeeming tokenId " + tokenId + ": " + signature);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      const tx = await vaultContract.redeemTo(tokenId, signature);
      log("RedeemTo transaction submitted for tokenId " + tokenId);
      await tx.wait();
      log("RedeemTo transaction confirmed for tokenId " + tokenId);
      loadNFTs();
    } catch (error) {
      log("Error during redeemTo: " + error.message);
    }
  };

  // Handler for claiming the NFT (transfers NFT to connected wallet)
  const handleClaimNFT = async (tokenId) => {
    if (!pk || !ethers.utils.isHexString(pk, 32)) {
      alert("No valid private key available.");
      return;
    }
    if (!currentAccount) {
      alert("Please connect your wallet first.");
      return;
    }
    try {
      // Sign message "Claim:" + tokenId
      const message = ethers.utils.solidityKeccak256(["string", "uint256"], ["Claim:", tokenId]);
      const messageHashBytes = ethers.utils.arrayify(message);
      const redeemerWallet = new ethers.Wallet(pk);
      const signature = await redeemerWallet.signMessage(messageHashBytes);
      log("Signature for claiming tokenId " + tokenId + ": " + signature);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      const tx = await vaultContract.claimNFT(tokenId, signature);
      log("ClaimNFT transaction submitted for tokenId " + tokenId);
      await tx.wait();
      log("ClaimNFT transaction confirmed for tokenId " + tokenId);
      loadNFTs();
    } catch (error) {
      log("Error during claimNFT: " + error.message);
    }
  };

  useEffect(() => {
    if (ownerAddress) {
      loadNFTs();
    }
  }, [ownerAddress]);

  return (
    <div style={{ padding: "1rem" }}>
      <div className="container">
        <h1>Redemption Page</h1>
        {ownerAddress ? (
          <p>
            Redeeming NFTs for public address: <b>{ownerAddress}</b>
          </p>
        ) : (
          <p>No valid private key provided. Please add ?pk=YOUR_PRIVATE_KEY to the URL.</p>
        )}
        {!currentAccount && (
          <button onClick={connectWallet}>Connect Wallet to Pay Gas</button>
        )}
        {nfts.length > 0 ? (
          <div>
            <h3>Your NFTs</h3>
            <div className="nft-grid">
              {nfts.map((n) => (
                <div key={n.tokenId} className="nft-card">
                  <p>
                    <b>Token ID:</b> {n.tokenId}
                  </p>
                  <p>
                    <b>Face Value:</b> {n.faceValue} USD
                  </p>
                  {n.image ? (
                    <div>
                      <img
                        src={n.image.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                        alt="NFT Front"
                        style={{ width: "100%" }}
                      />
                      {n.imageBack && (
                        <img
                          src={n.imageBack.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                          alt="NFT Back"
                          style={{ width: "100%", marginTop: "0.5rem" }}
                        />
                      )}
                    </div>
                  ) : (
                    <p>No images available.</p>
                  )}
                  <button onClick={() => handleRedeemTo(n.tokenId)}>Redeem for Stablecoin</button>
                  <button onClick={() => handleClaimNFT(n.tokenId)} style={{ marginTop: "0.5rem" }}>
                    Claim NFT
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p>No NFTs found for address {ownerAddress}</p>
        )}
        <div style={{ marginTop: "2rem" }}>
          <h3>Debug Log</h3>
          {logMessages.map((msg, idx) => (
            <p key={idx} style={{ fontFamily: "monospace" }}>
              {msg}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RedemptionPage;
