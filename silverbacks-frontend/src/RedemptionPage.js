import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "react-router-dom";
import chains from "./chains.json";
import NFTCard from "./NFTCard";
import CryptoJS from "crypto-js";
import QrScanner from "react-qr-scanner"; // Using react-qr-scanner

// Minimal ABI snippets:
const stableCoinABI = ["function balanceOf(address) view returns (uint256)"];
const nftABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function faceValue(uint256 tokenId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)"
];
const vaultABI = [
  "function redeem(uint256 tokenId) external",
  "function redeemWithAuth(uint256 tokenId, bytes signature) external",
  "function redeemTo(uint256 tokenId, bytes signature) external",
  "function claimNFT(uint256 tokenId, bytes signature) external"
];

const RedemptionPage = ({ currentAccount }) => {
  const [searchParams] = useSearchParams();

  // Get URL parameters – encrypted pk and the ephemeral address
  const originalEncryptedPk = searchParams.get("pk") || "";
  const urlAddress = searchParams.get("address") || "";
  const urlNetworkParam = searchParams.get("network");

  // For display purposes only, format the encrypted pk into a valid hex string.
  // (This dummy value is only used so NFTCard’s check passes and shows ephemeral buttons.)
  const ephemeralDisplayPk = originalEncryptedPk
    ? (() => {
        // Remove any "0x" prefix from the original
        const raw = originalEncryptedPk.startsWith("0x")
          ? originalEncryptedPk.slice(2)
          : originalEncryptedPk;
        // Pad or trim to exactly 64 hex characters and re-add "0x"
        return "0x" + raw.padEnd(64, "0").slice(0, 64);
      })()
    : "";

  // The ephemeral NFT owner (from the URL)
  const [ownerAddress, setOwnerAddress] = useState("");
  // NFTs owned by the ephemeral address (for redemption)
  const [redeemNfts, setRedeemNfts] = useState([]);
  // NFTs owned by the connected wallet
  const [myNfts, setMyNFTs] = useState([]);
  // Debug logging
  const [logMessages, setLogMessages] = useState([]);
  // Contract addresses from chains.json
  const [contractAddresses, setContractAddresses] = useState(null);
  // StableCoin balance of connected wallet
  const [erc20Balance, setErc20Balance] = useState(null);
  // For QR scanning and pending actions
  const [scanning, setScanning] = useState(false);
  const [pendingAction, setPendingAction] = useState(""); // "redeem" or "claim"
  const [pendingTokenId, setPendingTokenId] = useState(null);
  const [decryptedPrivateKey, setDecryptedPrivateKey] = useState("");

  // Logging helper
  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  // --------------------------------------------------------------------------
  // 1) Load contract addresses from chains.json based on the connected network
  // --------------------------------------------------------------------------
  useEffect(() => {
    async function loadContractAddresses() {
      if (!window.ethereum) return;
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        const chainIdHex = "0x" + network.chainId.toString(16);
        if (chains[chainIdHex] && chains[chainIdHex].contracts) {
          setContractAddresses(chains[chainIdHex].contracts);
          log(`Loaded contract addresses for chain ${chainIdHex}`);
        } else {
          log(`Contracts not defined for chain ${chainIdHex}`);
        }
      } catch (error) {
        log(`Error loading contract addresses: ${error.message}`);
      }
    }
    loadContractAddresses();
  }, []);

  // --------------------------------------------------------------------------
  // 2) Store NFT owner address from URL if provided
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (originalEncryptedPk && urlAddress && ethers.utils.isAddress(urlAddress)) {
      setOwnerAddress(urlAddress);
      log(`NFT owner (from URL): ${urlAddress}`);
    } else {
      log(
        "No valid ephemeral wallet address in URL. Provide ?address=YOUR_WALLET_ADDRESS&pk=ENCRYPTED_KEY"
      );
    }
  }, [originalEncryptedPk, urlAddress]);

  // --------------------------------------------------------------------------
  // 3) Load the connected wallet's ERC20 balance
  // --------------------------------------------------------------------------
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
      const formatted = ethers.utils.formatEther(balance);
      log(`Connected wallet ERC20 balance: ${formatted}`);
      setErc20Balance(formatted);
    } catch (err) {
      log(`Error loading ERC20 balance: ${err.message}`);
    }
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadERC20Balance();
    }
  }, [currentAccount, contractAddresses]);

  // --------------------------------------------------------------------------
  // 4) Load ephemeral key's NFTs (for redemption) from the owner address
  // --------------------------------------------------------------------------
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
      log(`Ephemeral key owns ${count.toString()} NFT(s).`);
      const nftData = [];
      for (let i = 0; i < count.toNumber(); i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(ownerAddress, i);
        const faceVal = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`Redeem NFT => tokenId=${tokenId}, faceValue=${faceVal}, tokenURI=${tokenURI}`);
        let metadata = {};
        try {
          if (tokenURI.startsWith("ipfs://")) {
            const cid = tokenURI.slice(7);
            const response = await fetch("https://silverbacksipfs.online/ipfs/" + cid);
            metadata = await response.json();
          }
        } catch (err) {
          log(`Error fetching metadata for token ${tokenId}: ${err.message}`);
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
        log(`No redeemable NFTs found for ephemeral address ${ownerAddress}`);
      }
    } catch (error) {
      log(`Error loading ephemeral key NFTs: ${error.message}`);
    }
  };

  useEffect(() => {
    if (ownerAddress && contractAddresses) {
      loadRedeemNFTs();
    }
  }, [ownerAddress, contractAddresses]);

  // --------------------------------------------------------------------------
  // 5) Load the connected wallet's NFTs
  // --------------------------------------------------------------------------
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
      log(`Connected wallet owns ${count.toString()} NFT(s).`);
      const nftData = [];
      for (let i = 0; i < count.toNumber(); i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(currentAccount, i);
        const faceVal = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`MyWallet NFT => tokenId=${tokenId}, faceValue=${faceVal}, URI=${tokenURI}`);
        let metadata = {};
        try {
          if (tokenURI.startsWith("ipfs://")) {
            const cid = tokenURI.slice(7);
            const response = await fetch("https://silverbacksipfs.online/ipfs/" + cid);
            metadata = await response.json();
          }
        } catch (err) {
          log(`Error fetching metadata for token ${tokenId}: ${err.message}`);
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
      setMyNFTs(nftData);
      if (nftData.length === 0) {
        log(`No NFTs found in connected wallet ${currentAccount}`);
      }
    } catch (error) {
      log(`Error loading connected wallet NFTs: ${error.message}`);
    }
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadMyNFTs();
    }
  }, [currentAccount, contractAddresses]);

  // --------------------------------------------------------------------------
  // 6) Initiate an action (for ephemeral NFTs) by opening the QR scanner
  // --------------------------------------------------------------------------
  const initiateAction = (tokenId, action) => {
    setPendingTokenId(tokenId);
    setPendingAction(action);
    setScanning(true);
    log(`Initiated ${action} for tokenId=${tokenId}. Please scan ephemeral key's QR code.`);
  };

  // --------------------------------------------------------------------------
  // 7) Handle QR scan: extract decryption key and decrypt the ephemeral private key
  // --------------------------------------------------------------------------
  const handleScan = async (data) => {
    if (data && scanning && pendingTokenId !== null && pendingAction) {
      let scannedKey = "";
      if (typeof data === "string") {
        scannedKey = data;
      } else if (typeof data === "object") {
        log(`QR Code scanned raw data: ${JSON.stringify(data)}`);
        scannedKey = data.text || JSON.stringify(data);
      } else {
        scannedKey = String(data);
      }
      log(`Extracted decryption key from QR code: ${scannedKey}`);
      log(`Original encrypted pk from URL: ${originalEncryptedPk}`);

      try {
        const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
        const aesKey = CryptoJS.MD5(scannedKey);
        log(`Derived AES key (MD5 of scanned key): ${aesKey.toString()}`);
        const decrypted = CryptoJS.AES.decrypt(
          { ciphertext: CryptoJS.enc.Hex.parse(originalEncryptedPk) },
          aesKey,
          { iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }
        );
        const decryptedHex = decrypted.toString(CryptoJS.enc.Hex);
        log(`Decrypted hex output: ${decryptedHex}`);
        const ephemeralPk = "0x" + decryptedHex;
        setDecryptedPrivateKey(ephemeralPk);
        log(`Decrypted ephemeral PK: ${ephemeralPk}`);

        const ephemeralWallet = new ethers.Wallet(ephemeralPk);
        const ephemeralAddress = ephemeralWallet.address;
        log(`Ephemeral wallet address: ${ephemeralAddress}`);
        log(`NFT owner (from URL): ${ownerAddress}`);

        if (ephemeralAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
          log(`ERROR: ephemeral address ${ephemeralAddress} does not match URL address ${ownerAddress}. Cannot proceed.`);
          setScanning(false);
          setPendingTokenId(null);
          setPendingAction("");
          return;
        }

        // Execute the selected action using the original encrypted pk for decryption.
        await executeAction(pendingTokenId, pendingAction, ephemeralPk);
      } catch (err) {
        log(`Error during ephemeral PK decryption: ${err.message}`);
      }
      setScanning(false);
      setPendingTokenId(null);
      setPendingAction("");
    }
  };

  const handleError = (err) => {
    log(`QR Scanner error: ${err.message}`);
  };

  // --------------------------------------------------------------------------
  // 8A) Execute action for ephemeral NFTs (redeem or claim)
  // --------------------------------------------------------------------------
  const executeAction = async (tokenId, action, ephemeralPrivateKey) => {
    try {
      const ephemeralWallet = new ethers.Wallet(ephemeralPrivateKey);
      let msg;
      let signature;
      let tx;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);

      if (action === "redeem") {
        msg = ethers.utils.solidityKeccak256(["string", "uint256"], ["Redeem:", tokenId]);
        const messageHashBytes = ethers.utils.arrayify(msg);
        signature = await ephemeralWallet.signMessage(messageHashBytes);
        log(`Ephemeral signature (redeem): ${signature}`);
        log(`Calling vaultContract.redeemTo(${tokenId}, signature)...`);
        tx = await vaultContract.redeemTo(tokenId, signature);
        log(`Transaction sent: redeemTo for tokenId=${tokenId}`);
        await tx.wait();
        log(`RedeemTo confirmed for tokenId=${tokenId}`);
        loadRedeemNFTs();
        loadERC20Balance();
      } else if (action === "claim") {
        msg = ethers.utils.solidityKeccak256(["string", "uint256"], ["Claim:", tokenId]);
        const messageHashBytes = ethers.utils.arrayify(msg);
        signature = await ephemeralWallet.signMessage(messageHashBytes);
        log(`Ephemeral signature (claim): ${signature}`);
        log(`Calling vaultContract.claimNFT(${tokenId}, signature)...`);
        tx = await vaultContract.claimNFT(tokenId, signature);
        log(`Transaction sent: claimNFT for tokenId=${tokenId}`);
        await tx.wait();
        log(`ClaimNFT confirmed for tokenId=${tokenId}`);
        loadRedeemNFTs();
      }
    } catch (err) {
      log(`Error executing ${action} for tokenId ${tokenId}: ${err.message}`);
    }
  };

  // --------------------------------------------------------------------------
  // 8B) For connected wallet NFTs: directly redeem (burn NFT to receive tokens)
  // --------------------------------------------------------------------------
  const handleRedeemConnected = async (tokenId) => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      log(`Redeeming NFT tokenId ${tokenId} for stablecoins...`);
      const tx = await vaultContract.redeem(tokenId, { gasLimit: 10000000 });
      await tx.wait();
      log(`Redeem confirmed for tokenId ${tokenId}`);
      loadMyNFTs();
      loadERC20Balance();
    } catch (err) {
      log("Error redeeming NFT: " + err.message);
    }
  };

  // --------------------------------------------------------------------------
  // 8C) For connected wallet NFTs: send NFT to another address
  // --------------------------------------------------------------------------
  const handleSendNFT = async (tokenId) => {
    if (!currentAccount || !contractAddresses) {
      log("Wallet not connected");
      return;
    }
    const recipient = prompt("Enter the recipient address to send the NFT:");
    if (!recipient || !ethers.utils.isAddress(recipient)) {
      alert("Invalid address!");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, signer);
      log(`Sending NFT tokenId ${tokenId} from ${currentAccount} to ${recipient}...`);
      const tx = await nftContract["safeTransferFrom(address,address,uint256)"](currentAccount, recipient, tokenId);
      await tx.wait();
      log(`NFT tokenId ${tokenId} sent to ${recipient}`);
      loadMyNFTs();
    } catch (err) {
      log("Error sending NFT: " + err.message);
    }
  };

  // --------------------------------------------------------------------------
  // 9) react-qr-scanner preview style
  // --------------------------------------------------------------------------
  const previewStyle = {
    height: 300,
    width: 300,
    margin: "0 auto",
    border: "2px solid #fff",
    borderRadius: "8px"
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="container">
      <h1 className="center-align">Redemption Page</h1>

      {/* Ephemeral Key's NFTs Section */}
      {ownerAddress && (
        <div className="card">
          <div className="card-content">
            <span className="card-title">
              Redeeming NFTs for Ephemeral Address:{" "}
              <code style={{ fontSize: "0.85em", fontFamily: "monospace" }}>{ownerAddress}</code>
            </span>
            {redeemNfts.length > 0 ? (
              <div className="row">
                {redeemNfts.map((n) => (
                  <NFTCard
                    key={n.tokenId}
                    nft={n}
                    // Pass the formatted dummy pk so that NFTCard shows "Redeem Stablecoin" and "Claim NFT"
                    pk={ephemeralDisplayPk}
                    handleRedeem={() => initiateAction(n.tokenId, "redeem")}
                    handleClaimNFT={() => initiateAction(n.tokenId, "claim")}
                    handleRedeemTo={() => {}}
                    handleSendNFT={() => {}}
                  />
                ))}
              </div>
            ) : (
              <p>No redeemable NFTs found for ephemeral address {ownerAddress}</p>
            )}
          </div>
        </div>
      )}

      {/* Connected Wallet's NFTs Section */}
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
                    // Do not pass a pk so that NFTCard shows "Redeem NFT" and "Send NFT"
                    handleRedeem={() => handleRedeemConnected(n.tokenId)}
                    handleSendNFT={() => handleSendNFT(n.tokenId)}
                    handleClaimNFT={() => {}}
                    handleRedeemTo={() => {}}
                  />
                ))}
              </div>
            ) : (
              <p>No NFTs found in your connected wallet.</p>
            )}
          </div>
        </div>
      )}

      {/* QR Code Scanner Modal */}
      {scanning && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.8)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <h4 style={{ color: "#fff", marginBottom: "1rem" }}>
            Please scan ephemeral key's QR code
          </h4>
          <QrScanner delay={300} style={previewStyle} onError={handleError} onScan={handleScan} />
          <button
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              backgroundColor: "#1976d2",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
            onClick={() => setScanning(false)}
          >
            Cancel
          </button>
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
