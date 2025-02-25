import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "react-router-dom";
import chains from "./chains.json";

// Minimal ABI snippets:
const stableCoinABI = [
  "function balanceOf(address) view returns (uint256)"
];
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
  const urlAddress = searchParams.get("address") || "";
  
  // For redemption tokens (from URL parameter)
  const [ownerAddress, setOwnerAddress] = useState("");
  const [redeemNfts, setRedeemNfts] = useState([]);
  
  // For connected wallet NFTs
  const [myNfts, setMyNfts] = useState([]);
  
  const [logMessages, setLogMessages] = useState([]);
  const [contractAddresses, setContractAddresses] = useState(null);
  const [erc20Balance, setErc20Balance] = useState(null);

  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  // Set ownerAddress from URL parameters.
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

  // Load contract addresses dynamically
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

  // Load ERC20 balance of the connected wallet
  const loadERC20Balance = async () => {
    if (!currentAccount || !contractAddresses) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const stableCoinContract = new ethers.Contract(contractAddresses.stableCoin, stableCoinABI, provider);
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

  // Load NFTs for redemption (using ownerAddress from URL)
  const loadRedeemNFTs = async () => {
    if (!ownerAddress || !window.ethereum || !contractAddresses) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, provider);
      const count = await nftContract.balanceOf(ownerAddress);
      const nftData = [];
      for (let i = 0; i < count.toNumber(); i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(ownerAddress, i);
        const faceVal = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`Redeem Section - Token ID ${tokenId} metadata URI: ${tokenURI}`);
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

  // Load NFTs for the connected wallet (currentAccount)
  const loadMyNFTs = async () => {
    if (!currentAccount || !window.ethereum || !contractAddresses) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, provider);
      const count = await nftContract.balanceOf(currentAccount);
      const nftData = [];
      for (let i = 0; i < count.toNumber(); i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(currentAccount, i);
        const faceVal = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`My Wallet - Token ID ${tokenId} metadata URI: ${tokenURI}`);
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
      setMyNfts(nftData);
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

  // Redeem functions remain unchanged
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

  return (
    <div style={pageContainerStyle}>
      <h1>Redemption Page</h1>
      {contractAddresses && (
        <div style={infoContainerStyle}>
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

      {/* Section for Redeeming NFTs (from URL ownerAddress) */}
      {ownerAddress && (
        <div style={{ marginBottom: "2rem" }}>
          <h2>Redeeming NFTs for Address: {ownerAddress}</h2>
          {redeemNfts.length > 0 ? (
            <div style={nftGridStyle}>
              {redeemNfts.map((n) => (
                <div key={n.tokenId} style={nftCardStyle}>
                  <p>
                    <strong>Token ID:</strong> {n.tokenId}
                  </p>
                  <p>
                    <strong>Face Value:</strong> {n.faceValue} USD
                  </p>
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
                  {(pk && ethers.utils.isHexString(pk, 32)) ? (
                    <>
                      <button onClick={() => handleRedeemTo(n.tokenId)} style={actionButtonStyle}>
                        Redeem for Stablecoin
                      </button>
                      <button
                        onClick={() => handleClaimNFT(n.tokenId)}
                        style={{ ...actionButtonStyle, marginTop: "0.5rem" }}
                      >
                        Claim NFT
                      </button>
                    </>
                  ) : (
                    <p style={{ fontStyle: "italic", color: "gray" }}>
                      Private key not provided. Redemption disabled.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p>No redeemable NFTs found for address {ownerAddress}</p>
          )}
        </div>
      )}

      {/* Section for Connected Wallet's NFTs */}
      {currentAccount && (
        <div style={{ marginBottom: "2rem" }}>
          <h2>Your Connected Wallet NFTs</h2>
          {myNfts.length > 0 ? (
            <div style={nftGridStyle}>
              {myNfts.map((n) => (
                <div key={n.tokenId} style={nftCardStyle}>
                  <p>
                    <strong>Token ID:</strong> {n.tokenId}
                  </p>
                  <p>
                    <strong>Face Value:</strong> {n.faceValue} USD
                  </p>
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
                </div>
              ))}
            </div>
          ) : (
            <p>No NFTs found in your connected wallet ({currentAccount})</p>
          )}
        </div>
      )}

      <div style={debugLogStyle}>
        <h3>Debug Log</h3>
        {logMessages.map((msg, idx) => (
          <p key={idx} style={{ fontFamily: "monospace", margin: 0 }}>
            {msg}
          </p>
        ))}
      </div>
    </div>
  );
};

// Styles
const pageContainerStyle = {
  padding: "2rem",
  backgroundColor: "#fff",
  borderRadius: "8px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  margin: "2rem auto",
  maxWidth: "900px"
};
const infoContainerStyle = {
  marginBottom: "1rem",
  padding: "1rem",
  backgroundColor: "#e9ecef",
  borderRadius: "8px"
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
const imageStyle = { width: "100%", borderRadius: "4px" };
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
