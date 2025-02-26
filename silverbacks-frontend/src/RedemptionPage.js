// src/RedemptionPage.js
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "react-router-dom";
import chains from "./chains.json";
import NFTCard from "./NFTCard";
import CryptoJS from "crypto-js";
import BarcodeScannerComponent from "react-qr-barcode-scanner";
import OpenApp from "react-open-app";

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

// Helper to shorten long addresses
const shortenAddress = (address) => {
  if (!address) return "";
  return address.slice(0, 6) + "..." + address.slice(-4);
};

const RedemptionPage = ({ currentAccount }) => {
  // Step-based state: "networkVerification", "actionSelection", "qrScan", "transaction", "confirmation"
  const [currentStep, setCurrentStep] = useState("networkVerification");
  // Selected action: "verify", "claim", or "redeem"
  const [selectedAction, setSelectedAction] = useState("");
  // Ephemeral NFT owner address (from URL)
  const [ownerAddress, setOwnerAddress] = useState("");
  // Lists for NFTs owned by ephemeral key and by connected wallet
  const [redeemNfts, setRedeemNFTs] = useState([]);
  const [myNfts, setMyNFTs] = useState([]);
  // Smart contract addresses and connected wallet ERC20 balance
  const [contractAddresses, setContractAddresses] = useState(null);
  const [erc20Balance, setErc20Balance] = useState(null);
  // States for QR scanning and pending action
  const [scanning, setScanning] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [pendingTokenId, setPendingTokenId] = useState(null);
  const [decryptedPrivateKey, setDecryptedPrivateKey] = useState("");
  // For transaction status (loading, etc.)
  const [transactionStatus, setTransactionStatus] = useState("");
  // QR Scanner controls
  const [stopStream, setStopStream] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  // Debug log
  const [logMessages, setLogMessages] = useState([]);

  // Get query parameters from URL
  const [searchParams] = useSearchParams();
  const originalEncryptedPk = searchParams.get("pk") || "";
  const urlAddress = searchParams.get("address") || "";
  const urlNetworkParam = searchParams.get("network");
  const ephemeralDisplayPk = originalEncryptedPk
    ? (() => {
        const raw = originalEncryptedPk.startsWith("0x")
          ? originalEncryptedPk.slice(2)
          : originalEncryptedPk;
        return "0x" + raw.padEnd(64, "0").slice(0, 64);
      })()
    : "";

  // Logging helper
  const log = (msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
    setLogMessages((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  // Provider function (kept as before)
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
          const targetChainId = targetChainKey; // keys in hex (e.g., "0xaa36a7")
          const network = await provider.getNetwork();
          const currentChainIdHex = "0x" + network.chainId.toString(16);
          if (currentChainIdHex.toLowerCase() !== targetChainId.toLowerCase()) {
            log(`Switching network from ${currentChainIdHex} to ${targetChainId} as specified in URL`);
            try {
              await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: targetChainId }],
              });
            } catch (switchError) {
              if (switchError.code === 4902) {
                log(`Network ${targetChainId} not added. Attempting to add new network.`);
                const chainData = chains[targetChainId];
                if (chainData) {
                  const addParams = {
                    chainId: targetChainId,
                    chainName: chainData.chainName || "Unknown Network",
                    rpcUrls: chainData.rpc ? [chainData.rpc] : [],
                    blockExplorerUrls: chainData.explorer ? [chainData.explorer] : [],
                    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }
                  };
                  try {
                    await window.ethereum.request({
                      method: "wallet_addEthereumChain",
                      params: [addParams],
                    });
                    log(`Successfully added network ${targetChainId}. Now switching network.`);
                    await window.ethereum.request({
                      method: "wallet_switchEthereumChain",
                      params: [{ chainId: targetChainId }],
                    });
                  } catch (addError) {
                    log("Error adding new network: " + addError.message);
                  }
                } else {
                  log("Chain data not found for targetChainId: " + targetChainId);
                }
              } else {
                log("Error switching network: " + switchError.message);
              }
            }
          }
        }
      }
      return provider;
    } else {
      let targetChain;
      if (urlNetworkParam) {
        const chainKeys = Object.keys(chains);
        targetChain = chainKeys.find((key) =>
          chains[key].chainName.toLowerCase().includes(urlNetworkParam.toLowerCase())
        );
      }
      if (!targetChain) {
        targetChain = "0xaa36a7";
      }
      const rpcUrl =
        chains[targetChain].rpc && chains[targetChain].rpc.length > 0
          ? chains[targetChain].rpc
          : null;
      if (!rpcUrl) {
        throw new Error("No RPC URL available for fallback provider on chain " + targetChain);
      }
      log("Using fallback JSON-RPC provider: " + rpcUrl);
      return new ethers.providers.JsonRpcProvider(rpcUrl);
    }
  };

  // Step 1: Load NFT owner address from URL
  useEffect(() => {
    if (originalEncryptedPk && urlAddress && ethers.utils.isAddress(urlAddress)) {
      setOwnerAddress(urlAddress);
      log(`NFT owner (from URL): ${urlAddress}`);
    } else {
      log("No valid ephemeral wallet address in URL. Provide ?address=YOUR_WALLET_ADDRESS&pk=ENCRYPTED_KEY");
    }
  }, [originalEncryptedPk, urlAddress]);

  // Step 1: Load contract addresses and verify network
  useEffect(() => {
    async function loadContractAddresses() {
      try {
        const provider = await getProvider();
        const network = await provider.getNetwork();
        const chainIdHex = "0x" + network.chainId.toString(16);
        log(`Network chainId: ${chainIdHex}`);
        if (chains[chainIdHex] && chains[chainIdHex].contracts) {
          setContractAddresses(chains[chainIdHex].contracts);
          log(`Loaded contract addresses for chain ${chainIdHex}`);
          // If a network parameter exists, check that it matches
          if (urlNetworkParam) {
            const expected = Object.values(chains).find((c) =>
              c.chainName.toLowerCase().includes(urlNetworkParam.toLowerCase())
            );
            if (expected && expected.chainName.toLowerCase() === chains[chainIdHex].chainName.toLowerCase()) {
              log("Network verified successfully.");
              setCurrentStep("actionSelection");
            } else {
              log("Current network does not match expected network.");
            }
          } else {
            // Default to moving forward if none specified
            setCurrentStep("actionSelection");
          }
        } else {
          log(`Contracts not defined for chain ${chainIdHex}`);
        }
      } catch (error) {
        log(`Error loading contract addresses: ${error.message}`);
      }
    }
    loadContractAddresses();
  }, [urlNetworkParam]);

  // Load Connected Wallet's ERC20 balance
  const loadERC20Balance = async () => {
    if (!currentAccount || !contractAddresses) return;
    if (!window.ethereum) {
      log("MetaMask not available; cannot load connected wallet balance.");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const stableCoinContract = new ethers.Contract(contractAddresses.stableCoin, stableCoinABI, provider);
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

  // Load ephemeral key's NFTs
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
    } catch (error) {
      log(`Error loading ephemeral key NFTs: ${error.message}`);
    }
  };

  useEffect(() => {
    if (ownerAddress && contractAddresses) {
      loadRedeemNFTs();
    }
  }, [ownerAddress, contractAddresses]);

  // Load connected wallet's NFTs
  const loadMyNFTs = async () => {
    if (!currentAccount || !window.ethereum || !contractAddresses) return;
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
    } catch (error) {
      log(`Error loading connected wallet NFTs: ${error.message}`);
    }
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadMyNFTs();
    }
  }, [currentAccount, contractAddresses]);

  // Enumerate video devices when scanning
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
            log(`Found ${videoInputs.length} video devices; using device index ${indexToUse}`);
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

  // Initiate QR scanning for claim/redeem actions
  const initiateAction = (tokenId, action) => {
    setPendingTokenId(tokenId);
    setPendingAction(action);
    setStopStream(false);
    setScanning(true);
    log(`Initiated ${action} for tokenId=${tokenId}. Please scan your bill's QR code.`);
    setCurrentStep("qrScan");
  };

  // Handle QR scan result
  const handleScan = async (err, result) => {
    if (err) {
      log(`QR Reader error: ${err.message}`);
      return;
    }
    if (result && pendingTokenId !== null && pendingAction) {
      log("QR Reader result received");
      setStopStream(true);
      setScanning(false);
      let scannedKey = "";
      if (typeof result === "object" && result.text) {
        scannedKey = result.text;
      } else {
        scannedKey = String(result);
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
        log(`Decrypted ephemeral PK: ${shortenAddress(ephemeralPk)}`);
        const ephemeralWallet = new ethers.Wallet(ephemeralPk);
        const ephemeralAddress = ephemeralWallet.address;
        log(`Ephemeral wallet address: ${shortenAddress(ephemeralAddress)}`);
        log(`NFT owner (from URL): ${shortenAddress(ownerAddress)}`);
        if (ephemeralAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
          log(`ERROR: Ephemeral address does not match NFT owner. Cannot proceed.`);
          return;
        }
        setCurrentStep("transaction");
        await executeAction(pendingTokenId, pendingAction, ephemeralPk);
      } catch (e) {
        log(`Error during ephemeral PK decryption: ${e.message}`);
      }
    }
  };

  // Execute claim or redeem action using ephemeral key
  const executeAction = async (tokenId, action, ephemeralPrivateKey) => {
    try {
      const ephemeralWallet = new ethers.Wallet(ephemeralPrivateKey);
      let msg;
      let signature;
      let tx;
      if (!window.ethereum) {
        log("MetaMask not available; cannot perform write operations.");
        return;
      }
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      if (action === "redeem") {
        msg = ethers.utils.solidityKeccak256(["string", "uint256"], ["Redeem:", tokenId]);
        const messageHashBytes = ethers.utils.arrayify(msg);
        signature = await ephemeralWallet.signMessage(messageHashBytes);
        log(`Ephemeral signature (redeem): ${signature.substring(0, 10)}...`);
        log(`Processing redemption for tokenId ${tokenId}...`);
        tx = await vaultContract.redeemTo(tokenId, signature);
        log(`Transaction sent: redeemTo for tokenId=${tokenId}`);
        setTransactionStatus("Waiting for confirmation...");
        await tx.wait();
        log(`Redemption confirmed for tokenId=${tokenId}`);
        loadRedeemNFTs();
        loadERC20Balance();
        setCurrentStep("confirmation");
      } else if (action === "claim") {
        msg = ethers.utils.solidityKeccak256(["string", "uint256"], ["Claim:", tokenId]);
        const messageHashBytes = ethers.utils.arrayify(msg);
        signature = await ephemeralWallet.signMessage(messageHashBytes);
        log(`Ephemeral signature (claim): ${signature.substring(0, 10)}...`);
        log(`Processing claim for tokenId ${tokenId}...`);
        tx = await vaultContract.claimNFT(tokenId, signature);
        log(`Transaction sent: claimNFT for tokenId=${tokenId}`);
        setTransactionStatus("Waiting for confirmation...");
        await tx.wait();
        log(`Claim confirmed for tokenId=${tokenId}`);
        loadRedeemNFTs();
        setCurrentStep("confirmation");
      }
    } catch (err) {
      log(`Error executing ${action} for tokenId ${tokenId}: ${err.message}`);
      setCurrentStep("confirmation");
    }
  };

  // Redeem NFT from connected wallet (bypassing ephemeral flow)
  const handleRedeemConnected = async (tokenId) => {
    if (!window.ethereum) {
      log("MetaMask not available for redeeming connected NFTs.");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      log(`Redeeming NFT tokenId ${tokenId} for stablecoins...`);
      const tx = await vaultContract.redeem(tokenId, { gasLimit: 10000000 });
      await tx.wait();
      log(`Redemption confirmed for tokenId ${tokenId}`);
      loadMyNFTs();
      loadERC20Balance();
    } catch (err) {
      log("Error redeeming NFT: " + err.message);
    }
  };

  // Send NFT from connected wallet
  const handleSendNFT = async (tokenId) => {
    if (!currentAccount || !contractAddresses || !window.ethereum) {
      log("Wallet not connected or MetaMask not available");
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
      log(`Sending NFT tokenId ${tokenId} from ${shortenAddress(currentAccount)} to ${shortenAddress(recipient)}...`);
      const tx = await nftContract["safeTransferFrom(address,address,uint256)"](currentAccount, recipient, tokenId);
      await tx.wait();
      log(`NFT tokenId ${tokenId} sent to ${shortenAddress(recipient)}`);
      loadMyNFTs();
    } catch (err) {
      log("Error sending NFT: " + err.message);
    }
  };

  // Render step-by-step flow UI
  const renderStep = () => {
    switch (currentStep) {
      case "networkVerification":
        return (
          <div style={{ padding: "2rem", height: "100vh", overflow: "auto" }}>
            <h2>Step 1: Network Verification</h2>
            <p>
              Please ensure your wallet is connected to the correct network. (Expected:{" "}
              {urlNetworkParam ? urlNetworkParam : "sepolia-testnet / linea-sepolia"})
            </p>
            <button
              className="btn"
              onClick={async () => {
                try {
                  const provider = await getProvider();
                  const network = await provider.getNetwork();
                  const chainIdHex = "0x" + network.chainId.toString(16);
                  if (
                    chains[chainIdHex] &&
                    chains[chainIdHex].chainName.toLowerCase().includes(
                      urlNetworkParam ? urlNetworkParam.toLowerCase() : "sepolia"
                    )
                  ) {
                    log("Network verified successfully.");
                    setCurrentStep("actionSelection");
                  } else {
                    // Redirect to instructions page to add network via revoke.cash
                    window.location.href = "https://revoke.cash/learn/wallets/add-network/ethereum-sepolia";
                  }
                } catch (e) {
                  log("Error verifying network: " + e.message);
                }
              }}
            >
              Check Network
            </button>
          </div>
        );
      case "actionSelection":
        return (
          <div style={{ padding: "2rem", height: "100vh", overflow: "auto" }}>
            <h2>Step 2: Choose an Action</h2>
            <p>Please select what you would like to do with your bill:</p>
            <div>
              <label>
                <input
                  type="radio"
                  name="action"
                  value="verify"
                  checked={selectedAction === "verify"}
                  onChange={() => setSelectedAction("verify")}
                />
                <span> Verify Bill (check authenticity only)</span>
              </label>
            </div>
            <div>
              <label>
                <input
                  type="radio"
                  name="action"
                  value="claim"
                  checked={selectedAction === "claim"}
                  onChange={() => setSelectedAction("claim")}
                />
                <span> Claim Bill (transfer NFT to your wallet)</span>
              </label>
            </div>
            <div>
              <label>
                <input
                  type="radio"
                  name="action"
                  value="redeem"
                  checked={selectedAction === "redeem"}
                  onChange={() => setSelectedAction("redeem")}
                />
                <span> Redeem Bill (burn NFT and receive stablecoins)</span>
              </label>
            </div>
            <button
              className="btn"
              onClick={() => {
                if (selectedAction === "") {
                  alert("Please select an action.");
                  return;
                }
                // If verify, simply move to confirmation (no QR needed)
                if (selectedAction === "verify") {
                  setCurrentStep("confirmation");
                } else {
                  setCurrentStep("qrScan");
                }
              }}
            >
              Next
            </button>
          </div>
        );
      case "qrScan":
        return (
          <div style={{ padding: "2rem", height: "100vh", overflow: "auto" }}>
            <h2>Step 3: Scan Your Bill's QR Code</h2>
            <p>
              For {selectedAction === "claim" ? "claiming" : "redeeming"} your bill, please scratch off the QR code on
              the back of your bill to reveal your redemption code and then press "Scan QR Code".
            </p>
            <button className="btn" onClick={() => setScanning(true)}>
              Scan QR Code
            </button>
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
                  textAlign: "center",
                }}
              >
                <h4 style={{ color: "#fff", marginBottom: "1rem" }}>Scan your QR code</h4>
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
                      cursor: "pointer",
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
                    cursor: "pointer",
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
          </div>
        );
      case "transaction":
        return (
          <div style={{ padding: "2rem", height: "100vh", overflow: "auto" }}>
            <h2>Step 4: Processing Transaction</h2>
            <p>Please wait while your transaction is being processed...</p>
            <p>{transactionStatus}</p>
          </div>
        );
      case "confirmation":
        return (
          <div style={{ padding: "2rem", height: "100vh", overflow: "auto" }}>
            <h2>Step 5: Confirmation</h2>
            {selectedAction === "verify" ? (
              <p>Your bill is authentic and still contains its NFT.</p>
            ) : selectedAction === "claim" ? (
              <p>Your bill has been claimed. The NFT has been transferred to your wallet.</p>
            ) : selectedAction === "redeem" ? (
              <p>Your bill has been redeemed. You have received stablecoins.</p>
            ) : null}
            <button className="btn" onClick={() => setCurrentStep("actionSelection")}>
              Back to Actions
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ height: "100vh", overflow: "hidden" }}>
      {renderStep()}
      {/* Debug log panel (optional) */}
      <div
        className="card-panel grey darken-3"
        style={{ color: "white", maxHeight: "20vh", overflow: "auto" }}
      >
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
