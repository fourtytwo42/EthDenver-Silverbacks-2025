// C:\Users\hendo420\Documents\Github\EthDenver-Silverbacks-2025\silverbacks-frontend\src\RedemptionPage.js

import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useSearchParams } from "react-router-dom";
import chains from "./chains.json";
import NFTCard from "./NFTCard";
import CryptoJS from "crypto-js";
import BarcodeScannerComponent from "react-qr-barcode-scanner";

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
  // Improved mobile detection for redirection.
  useEffect(() => {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const isMetaMaskBrowser = /MetaMask|MetaMaskMobile|DappWeb3/i.test(navigator.userAgent);
    if (isMobile && !isMetaMaskBrowser) {
      const currentUrl = window.location.href;
      const urlWithoutProtocol = currentUrl.replace(/^https?:\/\//, '');
      const metamaskDeepLink = `https://metamask.app.link/dapp/${urlWithoutProtocol}`;
      window.location.href = metamaskDeepLink;
    }
  }, []);

  // Determine if on a mobile device for styling purposes.
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  // Full-screen container to center the QR scanner.
  const modalContainerStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 1000
  };

  // Scanner modal styling.
  const scannerModalStyle = {
    width: "320px",
    backgroundColor: "rgba(0,0,0,0.9)",
    padding: "1rem",
    borderRadius: "8px",
    textAlign: "center"
  };

  // Extract query parameters.
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

  // State variables.
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
  // State for QR scanner.
  const [stopStream, setStopStream] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  // Track if camera permission has been granted.
  const [hasCameraPermission, setHasCameraPermission] = useState(false);

  // Logging helper.
  const log = (msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
    setLogMessages((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  // Request camera permission once on component mount.
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setHasCameraPermission(true);
        stream.getTracks().forEach(track => track.stop());
        log("Camera permission granted.");
      } catch (err) {
        log(`Error requesting camera permission: ${err.message}`);
      }
    })();
  }, []);

  // Helper: Get ethers provider.
  const getProvider = async () => {
    if (window.ethereum) {
      log("Using MetaMask provider");
      return new ethers.providers.Web3Provider(window.ethereum);
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
        chains[targetChain].rpcUrls && chains[targetChain].rpcUrls.length > 0
          ? chains[targetChain].rpcUrls[0]
          : null;
      if (!rpcUrl) {
        throw new Error("No RPC URL available for fallback provider on chain " + targetChain);
      }
      log("Using fallback JSON-RPC provider: " + rpcUrl);
      return new ethers.providers.JsonRpcProvider(rpcUrl);
    }
  };

  // 1) Load contract addresses.
  useEffect(() => {
    (async () => {
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
      } catch (error) {
        log(`Error loading contract addresses: ${error.message}`);
      }
    })();
  }, [urlNetworkParam]);

  // 2) Store NFT owner address from URL.
  useEffect(() => {
    if (originalEncryptedPk && urlAddress && ethers.utils.isAddress(urlAddress)) {
      setOwnerAddress(urlAddress);
      log(`NFT owner (from URL): ${urlAddress}`);
    } else {
      log("No valid ephemeral wallet address in URL. Provide ?address=YOUR_WALLET_ADDRESS&pk=ENCRYPTED_KEY");
    }
  }, [originalEncryptedPk, urlAddress]);

  // 3) Load connected wallet's ERC20 balance.
  const loadERC20Balance = async () => {
    if (!currentAccount || !contractAddresses) return;
    if (!window.ethereum) {
      log("MetaMask not available; cannot load connected wallet balance.");
      return;
    }
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

  // 4) Load ephemeral key's NFTs.
  const loadRedeemNFTs = async () => {
    if (!ownerAddress || !contractAddresses) return;
    try {
      const provider = await getProvider();
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

  // 5) Load connected wallet's NFTs.
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
            log(`Fetched metadata for connected tokenId=${tokenId}`);
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

  // 6) When scanning starts, simply enumerate available video devices.
  useEffect(() => {
    if (scanning) {
      (async function enumerateDevices() {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          if (videoInputs.length > 0) {
            setVideoDevices(videoInputs);
            // Use the first available device.
            setSelectedDeviceId(videoInputs[0].deviceId);
            log(`Found ${videoInputs.length} video device(s); using the first device (${videoInputs[0].label}).`);
          } else {
            log("No video devices found.");
          }
        } catch (err) {
          log(`Error enumerating video devices: ${err.message}`);
        }
        setStopStream(false);
      })();
    }
  }, [scanning]);

  // 7) Initiate an action (for ephemeral NFTs) by opening the QR scanner.
  const initiateAction = (tokenId, action) => {
    setPendingTokenId(tokenId);
    setPendingAction(action);
    setStopStream(false);
    setScanning(true);
    log(`Initiated ${action} for tokenId=${tokenId}. Please scan ephemeral key's QR code.`);
  };

  // 8) Handle QR scan.
  const handleScan = async (err, result) => {
    if (err) {
      log(`QR Reader error: ${err.message}`);
      return;
    }
    if (result && pendingTokenId !== null && pendingAction) {
      log("QR Reader result received");
      setStopStream(true);
      setScanning(false);
      let scannedKey = typeof result === "object" && result.text ? result.text : String(result);
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
          return;
        }
        await executeAction(pendingTokenId, pendingAction, ephemeralPk);
      } catch (e) {
        log(`Error during ephemeral PK decryption: ${e.message}`);
      }
    }
  };

  // 9A) Execute action for ephemeral NFTs (redeem or claim).
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

  // 9B) For connected wallet NFTs: directly redeem.
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
      log(`Redeem confirmed for tokenId ${tokenId}`);
      loadMyNFTs();
      loadERC20Balance();
    } catch (err) {
      log("Error redeeming NFT: " + err.message);
    }
  };

  // 9C) For connected wallet NFTs: send NFT.
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
      log(`Sending NFT tokenId ${tokenId} from ${currentAccount} to ${recipient}...`);
      const tx = await nftContract["safeTransferFrom(address,address,uint256)"](currentAccount, recipient, tokenId);
      await tx.wait();
      log(`NFT tokenId ${tokenId} sent to ${recipient}`);
      loadMyNFTs();
    } catch (err) {
      log("Error sending NFT: " + err.message);
    }
  };

  return (
    <div className="container">
      <h1 className="center-align">Redemption Page</h1>

      {/* Ephemeral Key's NFTs Section */}
      {ownerAddress && (
        <div className="card">
          <div className="card-content">
            <span className="card-title">
              Redeeming NFTs for Ephemeral Address:{" "}
              <code style={{ fontSize: "0.85em", fontFamily: "monospace" }}>
                {ownerAddress}
              </code>
            </span>
            {redeemNfts.length > 0 ? (
              <div className="row">
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
        <div style={modalContainerStyle}>
          <div style={scannerModalStyle}>
            <h4 style={{ color: "#fff", marginBottom: "1rem" }}>
              Please scan ephemeral key's QR code
            </h4>
            <BarcodeScannerComponent
              delay={100} // Faster QR detection
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
