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

// Helper to shorten addresses for display
const shortenAddress = (address) => {
  if (!address) return "";
  return address.slice(0, 6) + "..." + address.slice(-4);
};

const RedemptionPage = ({ currentAccount, setCurrentAccount }) => {
  // Step flow: "walletNetwork", "nftDisplay", "qrScan", "transaction", "confirmation"
  const [currentStep, setCurrentStep] = useState("walletNetwork");
  // For action: "redeem", "claim", or "verify"
  const [selectedAction, setSelectedAction] = useState("");
  // Local state for wallet account if not provided
  const [localAccount, setLocalAccount] = useState(currentAccount);
  // Use the URL parameters for ephemeral bill (NFT) info
  const [searchParams] = useSearchParams();
  const originalEncryptedPk = searchParams.get("pk") || "";
  const urlEphemeralAddress = searchParams.get("address") || "";
  const urlNetworkParam = searchParams.get("network") || "";
  // Display a padded version of the encrypted pk (for debug, if needed)
  const ephemeralDisplayPk = originalEncryptedPk
    ? "0x" +
      (originalEncryptedPk.startsWith("0x")
        ? originalEncryptedPk.slice(2)
        : originalEncryptedPk)
        .padEnd(64, "0")
        .slice(0, 64)
    : "";
  // State for showing the network name (from URL parameter or chain info)
  const [displayNetwork, setDisplayNetwork] = useState(urlNetworkParam);
  // The NFT that is associated with the bill (from the ephemeral address)
  const [billNft, setBillNft] = useState(null);
  // Smart contract addresses
  const [contractAddresses, setContractAddresses] = useState(null);
  // Other states
  const [erc20Balance, setErc20Balance] = useState(null);
  const [transactionStatus, setTransactionStatus] = useState("");
  // QR scanning states
  const [scanning, setScanning] = useState(false);
  const [stopStream, setStopStream] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  // Pending action details
  const [pendingTokenId, setPendingTokenId] = useState(null);
  const [decryptedPrivateKey, setDecryptedPrivateKey] = useState("");
  // Debug log
  const [logMessages, setLogMessages] = useState([]);

  // Logging helper
  const log = (msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
    setLogMessages((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  // ---------- Helper: Provider and Network Verification ----------
  const getProvider = async () => {
    if (window.ethereum) {
      log("Using MetaMask provider");
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      return provider;
    } else {
      // Fallback provider
      let targetChain = urlNetworkParam ? urlNetworkParam : "sepolia-testnet";
      // Find corresponding chain key in chains
      const chainKey = Object.keys(chains).find((key) =>
        chains[key].chainName.toLowerCase().includes(targetChain.toLowerCase())
      );
      if (!chainKey) {
        throw new Error("No chain found matching the network parameter");
      }
      const rpcUrl = chains[chainKey].rpc;
      log("Using fallback JSON-RPC provider: " + rpcUrl);
      return new ethers.providers.JsonRpcProvider(rpcUrl);
    }
  };

  // ---------- Step 1: Wallet & Network Check ----------
  const checkWalletAndNetwork = async () => {
    // If wallet not connected, do nothing here; UI will prompt to connect.
    if (!localAccount) return;
    try {
      const provider = await getProvider();
      const network = await provider.getNetwork();
      const chainIdHex = "0x" + network.chainId.toString(16);
      log(`Detected network: ${chains[chainIdHex]?.chainName || chainIdHex}`);
      // If the URL parameter network is specified, compare it
      if (urlNetworkParam) {
        const expected = Object.values(chains).find((c) =>
          c.chainName.toLowerCase().includes(urlNetworkParam.toLowerCase())
        );
        if (expected && expected.chainName.toLowerCase() !== chains[chainIdHex].chainName.toLowerCase()) {
          // Attempt to switch network
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: Object.keys(chains).find(key => chains[key].chainName.toLowerCase() === expected.chainName.toLowerCase()) }],
            });
            log("Network switched successfully.");
          } catch (switchError) {
            // If error, prompt user with a link to add the network
            log("Unable to switch network automatically.");
            window.alert(
              `Please add the network for ${expected.chainName} by visiting:\n` +
                (expected.chainName.toLowerCase().includes("linea")
                  ? "https://revoke.cash/learn/wallets/add-network/linea-sepolia"
                  : "https://revoke.cash/learn/wallets/add-network/ethereum-sepolia") +
                "\nThen click OK to continue."
            );
            // Poll for network change
            let attempts = 0;
            while (attempts < 10) {
              const net = await provider.getNetwork();
              const newChainId = "0x" + net.chainId.toString(16);
              if (chains[newChainId]?.chainName.toLowerCase() === expected.chainName.toLowerCase()) {
                log("Network now matches expected. Proceeding...");
                break;
              }
              await new Promise((res) => setTimeout(res, 3000));
              attempts++;
            }
          }
        }
      }
      // Load contract addresses based on current network
      if (chains[chainIdHex] && chains[chainIdHex].contracts) {
        setContractAddresses(chains[chainIdHex].contracts);
        // Display the network at top throughout the flow
        setDisplayNetwork(chains[chainIdHex].chainName);
        log("Network verified and contracts loaded.");
        setCurrentStep("nftDisplay");
      } else {
        log("Contracts not defined for this network.");
      }
    } catch (error) {
      log("Error checking wallet/network: " + error.message);
    }
  };

  // ---------- Wallet Connect Handler ----------
  const connectWallet = async () => {
    if (!window.ethereum) {
      window.alert("MetaMask is not installed!");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const account = accounts[0];
      setLocalAccount(account);
      if (setCurrentAccount) {
        setCurrentAccount(account);
      }
      log("Wallet connected: " + shortenAddress(account));
      await checkWalletAndNetwork();
    } catch (error) {
      log("Error connecting wallet: " + error.message);
    }
  };

  // ---------- Step 2: Load NFT from ephemeral wallet (bill) ----------
  const loadBillNFT = async () => {
    if (!urlEphemeralAddress || !contractAddresses) return;
    try {
      const provider = await getProvider();
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, provider);
      const count = await nftContract.balanceOf(urlEphemeralAddress);
      log(`Ephemeral (bill) wallet owns ${count.toString()} NFT(s).`);
      if (count.toNumber() === 0) {
        log("No NFT found in bill. This bill may not be legitimate or has already been claimed.");
        setBillNft(null);
      } else {
        // For simplicity, take the first NFT
        const tokenId = await nftContract.tokenOfOwnerByIndex(urlEphemeralAddress, 0);
        const faceVal = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`Bill NFT => tokenId=${tokenId}, faceValue=${faceVal}, tokenURI=${tokenURI}`);
        let metadata = {};
        try {
          if (tokenURI.startsWith("ipfs://")) {
            const cid = tokenURI.slice(7);
            const response = await fetch("https://silverbacksipfs.online/ipfs/" + cid);
            metadata = await response.json();
            log("Bill NFT metadata fetched.");
          }
        } catch (err) {
          log("Error fetching bill NFT metadata: " + err.message);
        }
        setBillNft({
          tokenId: tokenId.toString(),
          faceValue: faceVal.toString(),
          tokenURI,
          image: metadata.image || null,
          imageBack: metadata.properties ? metadata.properties.imageBack : null,
          name: metadata.name || "",
          description: metadata.description || ""
        });
      }
    } catch (error) {
      log("Error loading bill NFT: " + error.message);
    }
  };

  // When contract addresses are loaded and wallet is connected, load bill NFT
  useEffect(() => {
    if (localAccount && contractAddresses) {
      loadBillNFT();
    }
  }, [localAccount, contractAddresses]);

  // ---------- Load Connected Wallet's ERC20 Balance (if needed) ----------
  const loadERC20Balance = async () => {
    if (!localAccount || !contractAddresses) return;
    try {
      const provider = await getProvider();
      const stableCoinContract = new ethers.Contract(contractAddresses.stableCoin, stableCoinABI, provider);
      const balance = await stableCoinContract.balanceOf(localAccount);
      const formatted = ethers.utils.formatEther(balance);
      log(`Connected wallet balance: ${formatted}`);
      setErc20Balance(formatted);
    } catch (err) {
      log("Error loading ERC20 balance: " + err.message);
    }
  };

  useEffect(() => {
    if (localAccount && contractAddresses) {
      loadERC20Balance();
    }
  }, [localAccount, contractAddresses]);

  // ---------- Step 3: QR Scanning ----------
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
          log("Error enumerating video devices: " + err.message);
        }
      }
      enumerateDevices();
      setStopStream(false);
    }
  }, [scanning]);

  // ---------- QR Scan Handler ----------
  const handleScan = async (err, result) => {
    if (err) {
      log("QR Reader error: " + err.message);
      return;
    }
    if (result && pendingTokenId !== null && pendingAction) {
      log("QR scan result received.");
      setStopStream(true);
      setScanning(false);
      let scannedKey = typeof result === "object" && result.text ? result.text : String(result);
      log("Extracted decryption key: " + scannedKey);
      try {
        const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
        const aesKey = CryptoJS.MD5(scannedKey);
        log("Derived AES key: " + aesKey.toString());
        const decrypted = CryptoJS.AES.decrypt(
          { ciphertext: CryptoJS.enc.Hex.parse(originalEncryptedPk) },
          aesKey,
          { iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }
        );
        const decryptedHex = decrypted.toString(CryptoJS.enc.Hex);
        log("Decrypted hex: " + decryptedHex);
        const ephemeralPk = "0x" + decryptedHex;
        setDecryptedPrivateKey(ephemeralPk);
        log("Decrypted ephemeral key: " + shortenAddress(ephemeralPk));
        const ephemeralWallet = new ethers.Wallet(ephemeralPk);
        const ephemeralAddress = ephemeralWallet.address;
        log("Ephemeral wallet address: " + shortenAddress(ephemeralAddress));
        log("Bill NFT owner (from URL): " + shortenAddress(urlEphemeralAddress));
        if (ephemeralAddress.toLowerCase() !== urlEphemeralAddress.toLowerCase()) {
          log("Error: The decrypted key does not match the bill NFT owner. This bill may be invalid or already claimed.");
          setCurrentStep("confirmation");
          return;
        }
        // Proceed to transaction step
        setCurrentStep("transaction");
        await executeAction(pendingTokenId, pendingAction, ephemeralPk);
      } catch (e) {
        log("Error during decryption: " + e.message);
      }
    }
  };

  // ---------- Execute Transaction ----------
  const executeAction = async (tokenId, action, ephemeralPrivateKey) => {
    try {
      const ephemeralWallet = new ethers.Wallet(ephemeralPrivateKey);
      let msg, signature, tx;
      if (!window.ethereum) {
        log("MetaMask not available; cannot perform transaction.");
        return;
      }
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      if (action === "redeem") {
        msg = ethers.utils.solidityKeccak256(["string", "uint256"], ["Redeem:", tokenId]);
        const messageHashBytes = ethers.utils.arrayify(msg);
        signature = await ephemeralWallet.signMessage(messageHashBytes);
        log("Ephemeral signature (redeem): " + signature.substring(0, 10) + "...");
        log("Processing redemption...");
        tx = await vaultContract.redeemTo(tokenId, signature);
      } else if (action === "claim") {
        msg = ethers.utils.solidityKeccak256(["string", "uint256"], ["Claim:", tokenId]);
        const messageHashBytes = ethers.utils.arrayify(msg);
        signature = await ephemeralWallet.signMessage(messageHashBytes);
        log("Ephemeral signature (claim): " + signature.substring(0, 10) + "...");
        log("Processing claim...");
        tx = await vaultContract.claimNFT(tokenId, signature);
      }
      setTransactionStatus("Waiting for confirmation...");
      await tx.wait();
      log(`${action === "redeem" ? "Redemption" : "Claim"} confirmed for tokenId ${tokenId}`);
      setCurrentStep("confirmation");
    } catch (err) {
      log(`Error executing ${action}: ` + err.message);
      setCurrentStep("confirmation");
    }
  };

  // ---------- Back Button Handler ----------
  const handleBack = () => {
    // Allow user to go back one step (except if on wallet/network check)
    if (currentStep === "qrScan") {
      setCurrentStep("nftDisplay");
    } else if (currentStep === "transaction" || currentStep === "confirmation") {
      setCurrentStep("nftDisplay");
    }
  };

  // ---------- Render Step-by-Step UI ----------
  const renderStep = () => {
    switch (currentStep) {
      case "walletNetwork":
        return (
          <div style={fullScreenStyle}>
            <h2>Wallet & Network</h2>
            {localAccount ? (
              <div>
                <p>
                  Connected Wallet: <strong>{shortenAddress(localAccount)}</strong>
                </p>
                <p>
                  Current Network (from URL): <strong>{displayNetwork || urlNetworkParam}</strong>
                </p>
                <button className="btn" onClick={checkWalletAndNetwork}>
                  Check Network &amp; Continue
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <h2>Please Connect Your Wallet</h2>
                <button className="btn-large" onClick={connectWallet}>
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        );
      case "nftDisplay":
        return (
          <div style={fullScreenStyle}>
            <div style={{ marginBottom: "1rem" }}>
              <h2>{displayNetwork || urlNetworkParam} Network</h2>
            </div>
            {billNft ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ position: "relative", marginBottom: "1rem" }}>
                  {billNft.image ? (
                    <img
                      src={billNft.image.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                      alt="Bill NFT Front"
                      style={{ width: "100%", maxHeight: "50vh", objectFit: "contain" }}
                    />
                  ) : (
                    <p>No image available</p>
                  )}
                  <button
                    style={flipButtonStyle}
                    onClick={() =>
                      setBillNft({
                        ...billNft,
                        image: billNft.imageBack || billNft.image,
                        imageBack: billNft.image // toggle back
                      })
                    }
                  >
                    Flip Image
                  </button>
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <button
                    className="btn-large"
                    style={{ width: "90%", marginBottom: "1rem" }}
                    onClick={() => {
                      setSelectedAction("redeem");
                      setPendingTokenId(billNft.tokenId);
                      setCurrentStep("qrScan");
                    }}
                  >
                    Redeem Bill
                  </button>
                  <p style={explanationStyle}>
                    Redeem your bill to burn the NFT and receive stablecoins.
                  </p>
                  <button
                    className="btn-large"
                    style={{ width: "90%" }}
                    onClick={() => {
                      setSelectedAction("claim");
                      setPendingTokenId(billNft.tokenId);
                      setCurrentStep("qrScan");
                    }}
                  >
                    Claim Bill
                  </button>
                  <p style={explanationStyle}>
                    Claim your bill to transfer the NFT into your wallet.
                  </p>
                </div>
                <button className="btn" onClick={handleBack}>
                  Back
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <h2>Error</h2>
                <p>
                  No NFT found for this bill. This bill may not be legitimate or has already been claimed.
                </p>
                <button className="btn" onClick={handleBack}>
                  Back
                </button>
              </div>
            )}
          </div>
        );
      case "qrScan":
        return (
          <div style={fullScreenStyle}>
            <h2>Scan Your Bill's QR Code</h2>
            <p>
              Scratch off the QR code on the back of your bill, then press "Scan QR Code" to capture your
              redemption code.
            </p>
            <div style={{ position: "relative", width: "100%", height: "60vh" }}>
              {scanning ? null : (
                <button className="btn" onClick={() => setScanning(true)}>
                  Start QR Scan
                </button>
              )}
              {scanning && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%"
                  }}
                >
                  <BarcodeScannerComponent
                    delay={100}
                    width={"100%"}
                    height={"100%"}
                    stopStream={stopStream}
                    videoConstraints={
                      selectedDeviceId
                        ? { deviceId: { exact: selectedDeviceId } }
                        : { facingMode: "environment" }
                    }
                    onUpdate={handleScan}
                  />
                  <button className="btn" style={cancelButtonStyle} onClick={() => {
                    setStopStream(true);
                    setScanning(false);
                    setCurrentStep("nftDisplay");
                  }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <button className="btn" onClick={handleBack} style={{ marginTop: "1rem" }}>
              Back
            </button>
          </div>
        );
      case "transaction":
        return (
          <div style={fullScreenStyle}>
            <h2>Processing Transaction</h2>
            <p>{transactionStatus || "Your transaction is being processed. Please wait..."}</p>
            <button className="btn" onClick={handleBack}>
              Back
            </button>
          </div>
        );
      case "confirmation":
        return (
          <div style={fullScreenStyle}>
            <h2>Confirmation</h2>
            {selectedAction === "redeem" ? (
              <p>Your bill has been redeemed. You have received stablecoins.</p>
            ) : selectedAction === "claim" ? (
              <p>Your bill has been claimed. The NFT has been transferred to your wallet.</p>
            ) : (
              <p>The bill is authentic.</p>
            )}
            <button className="btn" onClick={() => setCurrentStep("nftDisplay")}>
              Back to Options
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  // ---------- Full Screen Style ----------
  const fullScreenStyle = {
    height: "100vh",
    overflowY: "auto",
    padding: "2rem",
    textAlign: "center"
  };

  const flipButtonStyle = {
    position: "absolute",
    top: "10px",
    right: "10px",
    backgroundColor: "rgba(0,0,0,0.6)",
    color: "#fff",
    border: "none",
    padding: "5px 10px",
    cursor: "pointer",
    borderRadius: "4px"
  };

  const cancelButtonStyle = {
    position: "absolute",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "#d32f2f",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    cursor: "pointer",
    borderRadius: "4px"
  };

  // ---------- On Component Mount: If wallet is already connected, trigger step 1 check ----------
  useEffect(() => {
    if (localAccount) {
      checkWalletAndNetwork();
    }
  }, [localAccount]);

  // Also update localAccount if prop currentAccount changes
  useEffect(() => {
    if (currentAccount) {
      setLocalAccount(currentAccount);
    }
  }, [currentAccount]);

  return (
    <div style={{ height: "100vh", overflow: "hidden" }}>
      {renderStep()}
      {/* Optional Debug Log Panel */}
      <div style={{ position: "fixed", bottom: 0, width: "100%", maxHeight: "15vh", overflowY: "auto", backgroundColor: "#333", color: "#fff", padding: "0.5rem", fontSize: "0.75rem" }}>
        <strong>Debug Log:</strong>
        {logMessages.map((msg, idx) => (
          <div key={idx}>{msg}</div>
        ))}
      </div>
    </div>
  );
};

export default RedemptionPage;
