import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "react-router-dom";

const silverbacksNftAddress = "0xEb641123243b897201B7E1fB2052256B6E9e1f5a";
const vaultAddress = "0x2A314860Cc789D30E384369769e2C85b67939689";

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

const RedemptionPage = ({ currentAccount }) => {
  const [searchParams] = useSearchParams();
  const pk = searchParams.get("pk") || "";
  const [ownerAddress, setOwnerAddress] = useState("");
  const [nfts, setNfts] = useState([]);
  const [logMessages, setLogMessages] = useState([]);

  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  // Create off–chain wallet instance from provided private key.
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
        log(`Token ID ${tokenId} metadata URI: ${tokenURI}`);
        let metadata = {};
        try {
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
    <div style={pageContainerStyle}>
      <h1>Redemption Page</h1>
      {ownerAddress && (
        <p>
          Redeeming NFTs for public address: <strong>{ownerAddress}</strong>
        </p>
      )}
      <div style={nftGridStyle}>
        {nfts.length > 0 ? (
          nfts.map((n) => (
            <div key={n.tokenId} style={nftCardStyle}>
              <p><strong>Token ID:</strong> {n.tokenId}</p>
              <p><strong>Face Value:</strong> {n.faceValue} USD</p>
              {n.image ? (
                <div>
                  <img
                    src={n.image.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                    alt="NFT Front"
                    style={imageStyle}
                  />
                  {n.imageBack && (
                    <img
                      src={n.imageBack.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                      alt="NFT Back"
                      style={{ ...imageStyle, marginTop: "0.5rem" }}
                    />
                  )}
                </div>
              ) : (
                <p>No images available.</p>
              )}
              <button onClick={() => handleRedeemTo(n.tokenId)} style={actionButtonStyle}>
                Redeem for Stablecoin
              </button>
              <button onClick={() => handleClaimNFT(n.tokenId)} style={{ ...actionButtonStyle, marginTop: "0.5rem" }}>
                Claim NFT
              </button>
            </div>
          ))
        ) : (
          <p>No NFTs found for address {ownerAddress}</p>
        )}
      </div>
      <div style={debugLogStyle}>
        <h3>Debug Log</h3>
        {logMessages.map((msg, idx) => (
          <p key={idx} style={{ fontFamily: "monospace", margin: 0 }}>{msg}</p>
        ))}
      </div>
    </div>
  );
};

const pageContainerStyle = {
  padding: "2rem",
  backgroundColor: "#fff",
  borderRadius: "8px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  margin: "2rem auto",
  maxWidth: "900px"
};

const nftGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "1rem",
  marginTop: "1rem"
};

const nftCardStyle = {
  padding: "1rem",
  border: "1px solid #ddd",
  borderRadius: "8px",
  backgroundColor: "#f9f9f9",
  textAlign: "center"
};

const imageStyle = {
  width: "100%",
  borderRadius: "4px"
};

const actionButtonStyle = {
  padding: "0.5rem 1rem",
  marginTop: "0.5rem",
  backgroundColor: "#4CAF50",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer"
};

const debugLogStyle = {
  marginTop: "2rem",
  backgroundColor: "#333",
  color: "#fff",
  padding: "1rem",
  borderRadius: "4px",
  maxHeight: "200px",
  overflowY: "auto"
};

export default RedemptionPage;
