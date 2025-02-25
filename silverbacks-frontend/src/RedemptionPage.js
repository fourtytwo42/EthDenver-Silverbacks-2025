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
  "function redeemWithAuth(uint256 tokenId, bytes signature) external"
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

  // Create a wallet instance from the provided private key (this is off‑chain)
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

  // Load NFTs owned by the computed ownerAddress
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
        nftData.push({
          tokenId: tokenId.toString(),
          faceValue: faceVal.toString(),
          tokenURI
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

  // When the user clicks Redeem, sign a message using the private key
  // and call redeemWithAuth using the connected wallet.
  const handleRedeem = async (tokenId) => {
    if (!pk || !ethers.utils.isHexString(pk, 32)) {
      alert("No valid private key available.");
      return;
    }
    if (!currentAccount) {
      alert("Please connect your wallet first.");
      return;
    }
    try {
      // The message that must be signed is the hash of "Redeem:" concatenated with the tokenId.
      const message = ethers.utils.solidityKeccak256(["string", "uint256"], ["Redeem:", tokenId]);
      const messageHashBytes = ethers.utils.arrayify(message);
      // Create a temporary wallet instance from the provided private key.
      const redeemerWallet = new ethers.Wallet(pk);
      const signature = await redeemerWallet.signMessage(messageHashBytes);
      log("Signature for tokenId " + tokenId + ": " + signature);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      const tx = await vaultContract.redeemWithAuth(tokenId, signature);
      log("Redeem transaction submitted for tokenId " + tokenId);
      await tx.wait();
      log("Redeem transaction confirmed for tokenId " + tokenId);
      loadNFTs();
    } catch (error) {
      log("Error during redemption: " + error.message);
    }
  };

  useEffect(() => {
    if (ownerAddress) {
      loadNFTs();
    }
  }, [ownerAddress]);

  return (
    <div style={{ padding: "1rem" }}>
      <h1>Redemption Page</h1>
      {ownerAddress ? (
        <p>Redeeming NFTs for public address: <b>{ownerAddress}</b></p>
      ) : (
        <p>No valid private key provided.</p>
      )}
      {!currentAccount && (
        <button onClick={connectWallet}>Connect Wallet to Pay Gas</button>
      )}
      {nfts.length > 0 ? (
        <div>
          <h3>Your NFTs:</h3>
          <ul>
            {nfts.map((n) => (
              <li key={n.tokenId}>
                Token ID: {n.tokenId} | Face Value: {n.faceValue} | Metadata URI: {n.tokenURI}
                <button onClick={() => handleRedeem(n.tokenId)}>Redeem NFT</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>No NFTs found for address {ownerAddress}</p>
      )}
      <div style={{ marginTop: "2rem" }}>
        <h3>Debug Log</h3>
        {logMessages.map((msg, idx) => (
          <p key={idx} style={{ fontFamily: "monospace" }}>{msg}</p>
        ))}
      </div>
    </div>
  );
}

export default RedemptionPage;
