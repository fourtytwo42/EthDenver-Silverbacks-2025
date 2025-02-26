// src/RedemptionPage.js
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "react-router-dom";
import chains from "./chains.json";
import NFTCard from "./NFTCard";
import CryptoJS from "crypto-js";
import BarcodeScannerComponent from "react-qr-barcode-scanner";

// Minimal ABIs for interacting with our contracts
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

const RedemptionPage = ({ currentAccount, setCurrentAccount }) => {
  // -------------------------------
  // Helper: Render the network banner (declared before usage)
  // -------------------------------
  const renderNetworkBanner = () => (
    <div
      style={{
        backgroundColor: "#1976d2",
        color: "#fff",
        padding: "1rem",
        textAlign: "center",
        fontSize: "1.2rem"
      }}
    >
      {urlNetworkParam ? urlNetworkParam.toUpperCase() : "NETWORK"}
    </div>
  );

  // -------------------------------
  // Extract query parameters
  // -------------------------------
  const [searchParams] = useSearchParams();
  const urlNetworkParam = searchParams.get("network");
  const urlAddress = searchParams.get("address") || "";
  const originalEncryptedPk = searchParams.get("pk") || "";
  const ephemeralDisplayPk = originalEncryptedPk
    ? (() => {
        const raw = originalEncryptedPk.startsWith("0x")
          ? originalEncryptedPk.slice(2)
          : originalEncryptedPk;
        return "0x" + raw.padEnd(64, "0").slice(0, 64);
      })()
    : "";

  // -------------------------------
  // State variables
  // -------------------------------
  const [ownerAddress, setOwnerAddress] = useState("");
  const [redeemNfts, setRedeemNFTs] = useState([]);
  const [myNfts, setMyNFTs] = useState([]);
  const [logMessages, setLogMessages] = useState([]);
  const [contractAddresses, setContractAddresses] = useState(null);
  const [erc20Balance, setErc20Balance] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [pendingAction, setPendingAction] = useState(""); // "redeem" or "claim"
  const [pendingTokenId, setPendingTokenId] = useState(null);
  const [decryptedPrivateKey, setDecryptedPrivateKey] = useState("");
  const [error, setError] = useState("");
  // State for network missing prompt
  const [missingNetworkInfo, setMissingNetworkInfo] = useState(null);
  // QR scanner controls
  const [stopStream, setStopStream] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  // Control for wallet prompt overlay (we always render component)
  const [showWalletPrompt, setShowWalletPrompt] = useState(false);

  // -------------------------------
  // Logging helper
  // -------------------------------
  const log = (msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
    setLogMessages((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  // -------------------------------
  // Check if wallet is connected on mount
  // -------------------------------
  useEffect(() => {
    async function checkWallet() {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            setCurrentAccount(accounts[0]);
            log("Wallet already connected: " + accounts[0]);
          } else {
            setShowWalletPrompt(true);
          }
        } catch (err) {
          log("Error checking wallet connection: " + err.message);
        }
      }
    }
    checkWallet();
  }, [setCurrentAccount]);

  // -------------------------------
  // Wallet connect function
  // -------------------------------
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        setCurrentAccount(accounts[0]);
        setShowWalletPrompt(false);
      } catch (err) {
        log("Error connecting wallet: " + err.message);
      }
    } else {
      alert("MetaMask is not installed!");
    }
  };

  // -------------------------------
  // getProvider: Returns a provider and handles network switching.
  // If the wallet does not have the network, set missingNetworkInfo.
  // -------------------------------
  const getProvider = async () => {
    if (window.ethereum) {
      log("Using MetaMask provider");
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      if (urlNetworkParam) {
        const chainKeys = Object.keys(chains);
        const targetChainKey = chainKeys.find((key) =>
          chains[key].chainName.toLowerCase().includes(urlNetworkParam.toLowerCase())
        );
        if (targetChainKey) {
          const targetChainId = targetChainKey;
          const network = await provider.getNetwork();
          const currentChainIdHex = "0x" + network.chainId.toString(16);
          if (currentChainIdHex.toLowerCase() !== targetChainId.toLowerCase()) {
            log(`Current chain (${currentChainIdHex}) does not match target (${targetChainId}). Attempting to switch...`);
            try {
              await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: targetChainId }]
              });
            } catch (switchError) {
              // If error code is 4902, the chain is not added to the wallet.
              if (switchError.code === 4902) {
                log(`Network ${targetChainId} not found in wallet.`);
                // Determine revoke.cash link based on urlNetworkParam.
                let revokeLink = "";
                if (urlNetworkParam && urlNetworkParam.toLowerCase().includes("ethereum-sepolia")) {
                  revokeLink = "https://revoke.cash/learn/wallets/add-network/ethereum-sepolia";
                } else if (urlNetworkParam && urlNetworkParam.toLowerCase().includes("linea-sepolia")) {
                  revokeLink = "https://revoke.cash/learn/wallets/add-network/linea-sepolia";
                }
                if (revokeLink) {
                  setMissingNetworkInfo({
                    link: revokeLink,
                    network: chains[targetChainId].chainName
                  });
                  // Return provider even though network is not switched
                  return provider;
                } else {
                  throw new Error("Network missing and no revoke.cash link available.");
                }
              } else {
                log("Error switching network: " + switchError.message);
                throw new Error("Error switching network: " + switchError.message);
              }
            }
          }
        }
      }
      return provider;
    } else {
      // Fallback JSON-RPC provider (default to Sepolia)
      let targetChain = "0xaa36a7";
      const rpcUrl =
        chains[targetChain] &&
        chains[targetChain].rpc &&
        chains[targetChain].rpc.length > 0
          ? chains[targetChain].rpc
          : null;
      if (!rpcUrl) {
        throw new Error("No RPC URL available for fallback provider on chain " + targetChain);
      }
      log("Using fallback JSON-RPC provider: " + rpcUrl);
      return new ethers.providers.JsonRpcProvider(rpcUrl);
    }
  };

  // -------------------------------
  // Listen for chain changes to clear missing network prompt if added
  // -------------------------------
  useEffect(() => {
    if (window.ethereum) {
      const handleChainChanged = async (chainId) => {
        log("Chain changed: " + chainId);
        // Re-check if current chain now matches target network.
        try {
          const provider = await getProvider();
          const network = await provider.getNetwork();
          const currentChainIdHex = "0x" + network.chainId.toString(16);
          const chainKeys = Object.keys(chains);
          const targetChainKey = chainKeys.find((key) =>
            chains[key].chainName.toLowerCase().includes(urlNetworkParam.toLowerCase())
          );
          if (targetChainKey && currentChainIdHex.toLowerCase() === targetChainKey.toLowerCase()) {
            log("Required network now added. Clearing missing network prompt.");
            setMissingNetworkInfo(null);
          }
        } catch (e) {
          log("Error checking chain after change: " + e.message);
        }
      };
      window.ethereum.on("chainChanged", handleChainChanged);
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("chainChanged", handleChainChanged);
        }
      };
    }
  }, [urlNetworkParam]);

  // -------------------------------
  // Load contract addresses
  // -------------------------------
  useEffect(() => {
    async function loadContracts() {
      try {
        const provider = await getProvider();
        const network = await provider.getNetwork();
        const chainIdHex = "0x" + network.chainId.toString(16);
        log(`Network chainId: ${chainIdHex}`);
        if (chains[chainIdHex] && chains[chainIdHex].contracts) {
          setContractAddresses(chains[chainIdHex].contracts);
          log(`Loaded contract addresses for chain ${chainIdHex}`);
        } else {
          log(`Contracts not defined for chain ${chainIdHex}`);
        }
      } catch (err) {
        log(`Error loading contract addresses: ${err.message}`);
        setError("Failed to load contract addresses: " + err.message);
      }
    }
    loadContracts();
  }, [urlNetworkParam]);

  // -------------------------------
  // Load connected wallet's ERC20 balance
  // -------------------------------
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

  // -------------------------------
  // Set NFT owner address from URL parameters
  // -------------------------------
  useEffect(() => {
    if (originalEncryptedPk && urlAddress && ethers.utils.isAddress(urlAddress)) {
      setOwnerAddress(urlAddress);
      log(`NFT owner (from URL): ${urlAddress}`);
    } else {
      log("No valid ephemeral wallet address in URL. Provide ?address=YOUR_ADDRESS&pk=ENCRYPTED_KEY");
    }
  }, [originalEncryptedPk, urlAddress]);

  // -------------------------------
  // Load ephemeral key's NFTs
  // -------------------------------
  const loadRedeemNFTs = async () => {
    if (!ownerAddress || !contractAddresses) return;
    try {
      const provider = await getProvider();
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, provider);
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
            log(`Fetched metadata for tokenId=${tokenId}`);
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
      setRedeemNFTs(nftData);
      if (nftData.length === 0) {
        log(`No redeemable NFTs found for ephemeral address ${ownerAddress}`);
      }
    } catch (err) {
      log(`Error loading ephemeral key NFTs: ${err.message}`);
    }
  };

  useEffect(() => {
    if (ownerAddress && contractAddresses) {
      loadRedeemNFTs();
    }
  }, [ownerAddress, contractAddresses]);

  // -------------------------------
  // Load connected wallet's NFTs
  // -------------------------------
  const loadMyNFTs = async () => {
    if (!currentAccount || !contractAddresses) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, provider);
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
            log(`Fetched metadata for tokenId=${tokenId}`);
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
    } catch (err) {
      log(`Error loading connected wallet NFTs: ${err.message}`);
    }
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadMyNFTs();
    }
  }, [currentAccount, contractAddresses]);

  // -------------------------------
  // Enumerate video devices when scanning
  // -------------------------------
  useEffect(() => {
    if (scanning) {
      async function enumerateDevices() {
        try {
          await navigator.mediaDevices.getUserMedia({ video: true });
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          setVideoDevices(videoInputs);
          if (videoInputs.length > 0) {
            const backIndex = videoInputs.findIndex((d) => /back|rear/i.test(d.label));
            const indexToUse = backIndex >= 0 ? backIndex : 0;
            setSelectedCameraIndex(indexToUse);
            setSelectedDeviceId(videoInputs[indexToUse].deviceId);
            log(`Using camera: ${videoInputs[indexToUse].label || "unknown"}`);
          } else {
            log("No video devices found.");
          }
        } catch (err) {
          log(`Error enumerating video devices: ${err.message}`);
        }
      }
      enumerateDevices();
      setStopStream(false);
    }
  }, [scanning]);

  // -------------------------------
  // Initiate action via QR scanner
  // -------------------------------
  const initiateAction = (tokenId, action) => {
    setPendingTokenId(tokenId);
    setPendingAction(action);
    setStopStream(false);
    setScanning(true);
    log(`Initiated ${action} for tokenId=${tokenId}. Please scan the ephemeral key’s QR code.`);
  };

  // -------------------------------
  // Handle QR scan result
  // -------------------------------
  const handleScan = async (err, result) => {
    if (err) {
      log(`QR Reader error: ${err.message}`);
      return;
    }
    if (result && pendingTokenId !== null && pendingAction) {
      log("QR scan result received.");
      setStopStream(true);
      setScanning(false);
      let scannedKey = typeof result === "object" && result.text ? result.text : String(result);
      log(`Extracted decryption key from QR code: ${scannedKey}`);
      try {
        const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
        const aesKey = CryptoJS.MD5(scannedKey);
        log(`Derived AES key: ${aesKey.toString()}`);
        const decrypted = CryptoJS.AES.decrypt(
          { ciphertext: CryptoJS.enc.Hex.parse(originalEncryptedPk) },
          aesKey,
          { iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }
        );
        const decryptedHex = decrypted.toString(CryptoJS.enc.Hex);
        log(`Decrypted hex: ${decryptedHex}`);
        const ephemeralPk = "0x" + decryptedHex;
        setDecryptedPrivateKey(ephemeralPk);
        log(`Decrypted ephemeral PK: ${ephemeralPk}`);
        const ephemeralWallet = new ethers.Wallet(ephemeralPk);
        const ephemeralAddress = ephemeralWallet.address;
        log(`Ephemeral wallet address: ${ephemeralAddress}`);
        if (ephemeralAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
          log(`ERROR: ephemeral address ${ephemeralAddress} does not match URL address ${ownerAddress}.`);
          return;
        }
        await executeAction(pendingTokenId, pendingAction, ephemeralPk);
      } catch (e) {
        log(`Error during decryption: ${e.message}`);
      }
    }
  };

  // -------------------------------
  // Execute action (redeem or claim) for ephemeral NFTs
  // -------------------------------
  const executeAction = async (tokenId, action, ephemeralPrivateKey) => {
    try {
      const ephemeralWallet = new ethers.Wallet(ephemeralPrivateKey);
      let msg, signature, tx;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      if (action === "redeem") {
        msg = ethers.utils.solidityKeccak256(["string", "uint256"], ["Redeem:", tokenId]);
        const messageHashBytes = ethers.utils.arrayify(msg);
        signature = await ephemeralWallet.signMessage(messageHashBytes);
        log(`Ephemeral signature (redeem): ${signature}`);
        tx = await vaultContract.redeemTo(tokenId, signature);
        log(`redeemTo transaction sent for tokenId=${tokenId}`);
        await tx.wait();
        log(`redeemTo confirmed for tokenId=${tokenId}`);
        loadRedeemNFTs();
        loadERC20Balance();
      } else if (action === "claim") {
        msg = ethers.utils.solidityKeccak256(["string", "uint256"], ["Claim:", tokenId]);
        const messageHashBytes = ethers.utils.arrayify(msg);
        signature = await ephemeralWallet.signMessage(messageHashBytes);
        log(`Ephemeral signature (claim): ${signature}`);
        tx = await vaultContract.claimNFT(tokenId, signature);
        log(`claimNFT transaction sent for tokenId=${tokenId}`);
        await tx.wait();
        log(`claimNFT confirmed for tokenId=${tokenId}`);
        loadRedeemNFTs();
      }
    } catch (err) {
      log(`Error executing ${action} for tokenId ${tokenId}: ${err.message}`);
    }
  };

  // -------------------------------
  // Handle redemption of connected wallet's NFT
  // -------------------------------
  const handleRedeemConnected = async (tokenId) => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      log(`Redeeming NFT tokenId ${tokenId}...`);
      const tx = await vaultContract.redeem(tokenId, { gasLimit: 10000000 });
      await tx.wait();
      log(`Redeem confirmed for tokenId ${tokenId}`);
      loadMyNFTs();
      loadERC20Balance();
    } catch (err) {
      log("Error redeeming NFT: " + err.message);
    }
  };

  // -------------------------------
  // Handle sending NFT from connected wallet
  // -------------------------------
  const handleSendNFT = async (tokenId) => {
    const recipient = prompt("Enter the recipient address:");
    if (!recipient || !ethers.utils.isAddress(recipient)) {
      alert("Invalid address!");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, signer);
      log(`Sending NFT tokenId ${tokenId} to ${recipient}...`);
      const tx = await nftContract["safeTransferFrom(address,address,uint256)"](currentAccount, recipient, tokenId);
      await tx.wait();
      log(`NFT tokenId ${tokenId} sent to ${recipient}`);
      loadMyNFTs();
    } catch (err) {
      log("Error sending NFT: " + err.message);
    }
  };

  // -------------------------------
  // Render missing network prompt if needed
  // -------------------------------
  const renderMissingNetworkPrompt = () => (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(255,255,255,0.95)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 3000,
        textAlign: "center",
        padding: "1rem"
      }}
    >
      <h2 style={{ marginBottom: "1rem" }}>Network Not Added</h2>
      <p style={{ marginBottom: "1rem", padding: "0 1rem" }}>
        Your wallet does not have the {missingNetworkInfo.network} network added.
        Please visit{" "}
        <a href={missingNetworkInfo.link} target="_blank" rel="noopener noreferrer">
          {missingNetworkInfo.link}
        </a>{" "}
        to add it to your wallet, then click "Refresh".
      </p>
      <button
        style={{
          padding: "1rem 2rem",
          fontSize: "1.2rem",
          backgroundColor: "#1976d2",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer"
        }}
        onClick={() => window.location.reload()}
      >
        Refresh
      </button>
    </div>
  );

  // -------------------------------
  // Main render
  // -------------------------------
  return (
    <div style={{ padding: 0, margin: 0, backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      {missingNetworkInfo && renderMissingNetworkPrompt()}
      {renderNetworkBanner()}
      <div style={{ padding: "1rem" }}>
        {/* Wallet Prompt Overlay */}
        {showWalletPrompt && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(255,255,255,0.95)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 2000
            }}
          >
            <h1 style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>
              Please Connect Your Wallet
            </h1>
            <button
              onClick={connectWallet}
              style={{
                padding: "1rem 2rem",
                fontSize: "1.2rem",
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer"
              }}
            >
              Connect Wallet
            </button>
          </div>
        )}

        {/* Ephemeral NFT redemption section */}
        {ownerAddress && (
          <div style={{ marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>
              Redeem NFTs for Ephemeral Address:
            </h2>
            <code style={{ fontSize: "0.9rem" }}>{ownerAddress}</code>
            {redeemNfts.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: "1rem" }}>
                {redeemNfts.map((n) => (
                  <NFTCard
                    key={n.tokenId}
                    nft={n}
                    pk={ephemeralDisplayPk}
                    handleRedeemTo={() => initiateAction(n.tokenId, "redeem")}
                    handleClaimNFT={() => initiateAction(n.tokenId, "claim")}
                    handleRedeem={() => {}}
                    handleSendNFT={() => {}}
                  />
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "1rem" }}>
                No redeemable NFTs found for ephemeral address {ownerAddress}
              </p>
            )}
          </div>
        )}

        {/* Connected wallet NFT section */}
        {currentAccount && (
          <div style={{ marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Your Wallet NFTs</h2>
            {myNfts.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: "1rem" }}>
                {myNfts.map((n) => (
                  <NFTCard
                    key={n.tokenId}
                    nft={n}
                    handleRedeem={() => handleRedeemConnected(n.tokenId)}
                    handleSendNFT={() => handleSendNFT(n.tokenId)}
                    handleClaimNFT={() => {}}
                    handleRedeemTo={() => {}}
                  />
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "1rem" }}>No NFTs found in your connected wallet.</p>
            )}
          </div>
        )}

        {/* QR Code Scanner Modal */}
        {scanning && (
          <div
            style={{
              position: "fixed",
              top: "20%",
              left: "50%",
              transform: "translateX(-50%)",
              width: "320px",
              backgroundColor: "rgba(0,0,0,0.9)",
              padding: "1rem",
              borderRadius: "8px",
              zIndex: 1000,
              textAlign: "center"
            }}
          >
            <h4 style={{ color: "#fff", marginBottom: "1rem" }}>
              Scan ephemeral key QR code
            </h4>
            <BarcodeScannerComponent
              delay={100}
              width={300}
              height={300}
              stopStream={stopStream}
              videoConstraints={
                selectedDeviceId
                  ? { deviceId: { exact: selectedDeviceId } }
                  : { facingMode: "environment" }
              }
              onUpdate={handleScan}
            />
            {videoDevices.length > 1 && (
              <button
                style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: "#555",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
                onClick={() => {
                  const nextIndex = (selectedCameraIndex + 1) % videoDevices.length;
                  setSelectedCameraIndex(nextIndex);
                  setSelectedDeviceId(videoDevices[nextIndex].deviceId);
                  log(`Switching to camera: ${videoDevices[nextIndex].label || "unknown"}`);
                }}
              >
                Switch Camera
              </button>
            )}
            <button
              style={{
                marginTop: "0.5rem",
                padding: "0.5rem 1rem",
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer"
              }}
              onClick={() => {
                log("QR scanning cancelled by user");
                setStopStream(true);
                setScanning(false);
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Debug Log */}
        <div
          style={{
            marginTop: "2rem",
            padding: "0.5rem",
            backgroundColor: "#424242",
            color: "#fff",
            fontSize: "0.8rem"
          }}
        >
          <h5>Debug Log</h5>
          {logMessages.map((msg, idx) => (
            <p key={idx} style={{ fontFamily: "monospace", margin: "0.2rem 0" }}>
              {msg}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RedemptionPage;
