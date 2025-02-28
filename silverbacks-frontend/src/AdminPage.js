// src/AdminPage.js
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { create } from "ipfs-http-client";
import chains from "./chains.json";
import CryptoJS from "crypto-js"; // For AES encryption
import QRCode from "qrcode"; // For QR code generation
import JSZip from "jszip"; // For creating ZIP archives

// Minimal ABIs for interacting with our contracts
const stableCoinABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount) external"
];

const nftABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function faceValue(uint256 tokenId) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)"
];

// Unified vault ABI used for both Silverbacks and King Louis
const vaultABI = [
  "function deposit(uint256, string) external",
  "function depositTo(address, uint256, string) external",
  "function batchDeposit(address[] calldata, string[] calldata) external",
  "function redeem(uint256) external",
  "function redeemWithAuth(uint256, bytes) external",
  "function redeemTo(uint256, bytes) external",
  "function claimNFT(uint256, bytes) external"
];

const REQUIRED_WBTC = ethers.utils.parseUnits("0.05", 18);
const REQUIRED_WETH = ethers.utils.parseUnits("0.5", 18);
const REQUIRED_WLTC = ethers.utils.parseUnits("3", 18);

const AdminPage = ({ currentAccount }) => {
  // State declarations
  const [depositAmount, setDepositAmount] = useState("100");
  const [depositRecipient, setDepositRecipient] = useState("");
  const [frontImageFile, setFrontImageFile] = useState(null);
  const [backImageFile, setBackImageFile] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [nfts, setNfts] = useState([]);
  const [logMessages, setLogMessages] = useState([]);
  const [contractAddresses, setContractAddresses] = useState(null);
  const [erc20Balance, setErc20Balance] = useState("");
  const [activeTab, setActiveTab] = useState("mintSelf");
  const [keysToGenerate, setKeysToGenerate] = useState("1");
  const [generatedCSV, setGeneratedCSV] = useState(null);
  const [networkName, setNetworkName] = useState("main");
  const [testURL, setTestURL] = useState("");
  const [testDecryptionKey, setTestDecryptionKey] = useState("");
  const [testDecryptedPrivateKey, setTestDecryptedPrivateKey] = useState("");

  // NFT type selection: "silverbacks" uses stablecoin deposits; "kinglouis" uses 3 tokens (WBTC, WETH, WLTC)
  const [nftType, setNftType] = useState("silverbacks");

  // Token balances for connected wallet
  const [stableCoinBalance, setStableCoinBalance] = useState("");
  const [wbtcBalance, setWbtcBalance] = useState("");
  const [wethBalance, setWethBalance] = useState("");
  const [wltcBalance, setWltcBalance] = useState("");

  const tabButtonStyle = {
    padding: "10px 20px",
    cursor: "pointer",
    border: "none",
    backgroundColor: "#e0e0e0",
    marginRight: "5px",
    borderRadius: "4px"
  };

  const activeTabButtonStyle = {
    ...tabButtonStyle,
    backgroundColor: "#1976d2",
    color: "#fff"
  };

  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  // Initialize Materialize select elements
  useEffect(() => {
    if (window.M) {
      const elems = document.querySelectorAll("select");
      window.M.FormSelect.init(elems);
    }
  }, []);

  // -------------------------------------
  // Load Contract Addresses from chains.json
  // -------------------------------------
  const loadContractAddresses = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        const chainIdHex = "0x" + network.chainId.toString(16);
        if (chains[chainIdHex] && chains[chainIdHex].contracts) {
          setContractAddresses(chains[chainIdHex].contracts);
          setNetworkName(chains[chainIdHex].chainName);
          log("Loaded contract addresses for chain " + chainIdHex);
        } else {
          log("Contracts not defined for chain " + chainIdHex);
        }
      } catch (error) {
        log("Error loading contract addresses: " + error.message);
      }
    }
  };

  useEffect(() => {
    loadContractAddresses();
  }, []);

  useEffect(() => {
    if (window.ethereum && window.ethereum.on) {
      const handleChainChanged = (chainId) => {
        log("Chain changed to: " + chainId);
        loadContractAddresses();
      };
      window.ethereum.on("chainChanged", handleChainChanged);
      return () => {
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, []);

  // -------------------------------------
  // Load stablecoin balance and NFT data (using blockTag override)
  // -------------------------------------
  const loadData = async () => {
    if (!currentAccount || !contractAddresses) return;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    try {
      const stableCoinContract = new ethers.Contract(
        contractAddresses.stableCoin,
        stableCoinABI,
        provider
      );
      const bal = await stableCoinContract.balanceOf(currentAccount, { blockTag: "latest" });
      log("StableCoin balance (raw) = " + bal.toString());
      setErc20Balance(ethers.utils.formatEther(bal));
    } catch (err) {
      log("Error loading stable coin balance: " + err.message);
    }

    let nftData = [];
    // Load Silverbacks NFTs
    if (contractAddresses.silverbacksNFT) {
      const silverbacksNFTContract = new ethers.Contract(
        contractAddresses.silverbacksNFT,
        nftABI,
        provider
      );
      try {
        const count = await silverbacksNFTContract.balanceOf(currentAccount, { blockTag: "latest" });
        log("You own " + count.toNumber() + " Silverbacks NFTs.");
        for (let i = 0; i < count.toNumber(); i++) {
          const tokenId = await silverbacksNFTContract.tokenOfOwnerByIndex(currentAccount, i, { blockTag: "latest" });
          const faceVal = await silverbacksNFTContract.faceValue(tokenId, { blockTag: "latest" });
          const tokenURI = await silverbacksNFTContract.tokenURI(tokenId, { blockTag: "latest" });
          log(`Silverbacks NFT => tokenId=${tokenId}, faceValue=${faceVal}, tokenURI=${tokenURI}`);
          let metadata = {};
          try {
            if (tokenURI.startsWith("ipfs://")) {
              const cid = tokenURI.slice(7);
              const response = await fetch("https://silverbacksipfs.online/ipfs/" + cid);
              metadata = await response.json();
              log(`Fetched metadata for Silverbacks tokenId=${tokenId}`);
            }
          } catch (err) {
            log("Error fetching metadata for Silverbacks token " + tokenId + ": " + err.message);
          }
          nftData.push({
            tokenId: tokenId.toString(),
            faceValue: faceVal.toString(),
            tokenURI,
            image: metadata.image || null,
            imageBack: metadata.properties ? metadata.properties.imageBack : null,
            name: metadata.name || "",
            description: metadata.description || "",
            type: "silverbacks"
          });
        }
      } catch (err) {
        log("Error loading Silverbacks NFTs: " + err.message);
      }
    }
    // Load King Louis NFTs
    if (contractAddresses.multiTokenNFT) {
      const kinglouisNFTContract = new ethers.Contract(
        contractAddresses.multiTokenNFT,
        nftABI,
        provider
      );
      try {
        const count = await kinglouisNFTContract.balanceOf(currentAccount, { blockTag: "latest" });
        log("You own " + count.toNumber() + " King Louis NFTs.");
        for (let i = 0; i < count.toNumber(); i++) {
          const tokenId = await kinglouisNFTContract.tokenOfOwnerByIndex(currentAccount, i, { blockTag: "latest" });
          const faceVal = await kinglouisNFTContract.faceValue(tokenId, { blockTag: "latest" });
          const tokenURI = await kinglouisNFTContract.tokenURI(tokenId, { blockTag: "latest" });
          log(`King Louis NFT => tokenId=${tokenId}, faceValue=${faceVal}, tokenURI=${tokenURI}`);
          let metadata = {};
          try {
            if (tokenURI.startsWith("ipfs://")) {
              const cid = tokenURI.slice(7);
              const response = await fetch("https://silverbacksipfs.online/ipfs/" + cid);
              metadata = await response.json();
              log(`Fetched metadata for King Louis tokenId=${tokenId}`);
            }
          } catch (err) {
            log("Error fetching metadata for King Louis token " + tokenId + ": " + err.message);
          }
          nftData.push({
            tokenId: tokenId.toString(),
            faceValue: faceVal.toString(),
            tokenURI,
            image: metadata.image || null,
            imageBack: metadata.properties ? metadata.properties.imageBack : null,
            name: metadata.name || "",
            description: metadata.description || "",
            type: "kinglouis"
          });
        }
      } catch (err) {
        log("Error loading King Louis NFTs: " + err.message);
      }
    }
    setNfts(nftData);
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadData();
    }
  }, [currentAccount, contractAddresses]);

  // -------------------------------------
  // Load ERC20 token balances for connected wallet (with blockTag override)
  // -------------------------------------
  const loadTokenBalances = async () => {
    if (!currentAccount || !contractAddresses) return;
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      if (contractAddresses.stableCoin) {
        const stableCoinContract = new ethers.Contract(contractAddresses.stableCoin, stableCoinABI, provider);
        const balance = await stableCoinContract.balanceOf(currentAccount, { blockTag: "latest" });
        setStableCoinBalance(ethers.utils.formatEther(balance));
      }
      if (contractAddresses.wbtc) {
        const wbtcContract = new ethers.Contract(contractAddresses.wbtc, stableCoinABI, provider);
        const balance = await wbtcContract.balanceOf(currentAccount, { blockTag: "latest" });
        setWbtcBalance(ethers.utils.formatEther(balance));
      }
      if (contractAddresses.weth) {
        const wethContract = new ethers.Contract(contractAddresses.weth, stableCoinABI, provider);
        const balance = await wethContract.balanceOf(currentAccount, { blockTag: "latest" });
        setWethBalance(ethers.utils.formatEther(balance));
      }
      if (contractAddresses.wltc) {
        const wltcContract = new ethers.Contract(contractAddresses.wltc, stableCoinABI, provider);
        const balance = await wltcContract.balanceOf(currentAccount, { blockTag: "latest" });
        setWltcBalance(ethers.utils.formatEther(balance));
      }
    } catch (error) {
      log("Error loading token balances: " + error.message);
    }
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadTokenBalances();
    }
  }, [currentAccount, contractAddresses]);

  // -------------------------------------
  // Upload images and metadata JSON to IPFS.
  // -------------------------------------
  const uploadMetadataToIPFS = async (frontFile, backFile) => {
    try {
      if (!frontFile) {
        throw new Error("Front image file is required");
      }
      const ipfsClient = create({ url: "https://silverbacksipfs.online/api/v0" });
      const frontAdded = await ipfsClient.add(frontFile);
      const frontCID = frontAdded.path;
      log("Front image uploaded with CID: " + frontCID);
      let backCID = "";
      if (backFile) {
        const backAdded = await ipfsClient.add(backFile);
        backCID = backAdded.path;
        log("Back image uploaded with CID: " + backCID);
      }
      const metadata = {
        name: nftType === "silverbacks" ? "Silverback NFT" : "King Louis NFT",
        description:
          nftType === "silverbacks"
            ? "An NFT representing a $100 bill."
            : "A King Louis NFT with exclusive features.",
        image: "ipfs://" + frontCID,
        properties: { imageBack: backCID ? "ipfs://" + backCID : "" }
      };
      const metadataAdded = await ipfsClient.add(JSON.stringify(metadata));
      const metadataCID = metadataAdded.path;
      const metaURI = "ipfs://" + metadataCID;
      log("Metadata JSON uploaded with URI: " + metaURI);
      return metaURI;
    } catch (error) {
      log("Error uploading metadata: " + error.message);
      throw error;
    }
  };

  // Helper: Get the correct vault address based on nftType.
  const getVaultAddress = () => {
    if (!contractAddresses) return null;
    return nftType === "silverbacks"
      ? contractAddresses.vault
      : contractAddresses.multiTokenVault;
  };

  // --------------------------------------------------
  // Helper function to safely approve token allowances.
  // Passes a blockTag override and gasLimit to fix unichain errors.
  // --------------------------------------------------
  const safeApprove = async (tokenContract, tokenSymbol, spender, amount) => {
    const currentAllowance = await tokenContract.allowance(currentAccount, spender, { blockTag: "latest" });
    if (currentAllowance.gt(0)) {
      log(`Resetting ${tokenSymbol} allowance to 0...`);
      let tx = await tokenContract.approve(spender, 0, { gasLimit: 100000 });
      await tx.wait();
    }
    log(`Approving vault to spend ${ethers.utils.formatUnits(amount, 18)} ${tokenSymbol}...`);
    let tx = await tokenContract.approve(spender, amount, { gasLimit: 100000 });
    await tx.wait();
  };

  // -------------------------------------
  // Silverbacks Deposit Functions
  // -------------------------------------
  const handleDeposit = async () => {
    if (!frontImageFile || !backImageFile) {
      alert("Please select both front and back images.");
      return;
    }
    const rawAmount = depositAmount.trim();
    if (!rawAmount || isNaN(Number(rawAmount)) || Number(rawAmount) % 100 !== 0) {
      alert("Deposit must be a multiple of 100!");
      return;
    }
    try {
      const metaURI = await uploadMetadataToIPFS(frontImageFile, backImageFile);
      const depositWei = ethers.utils.parseEther(rawAmount);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const stableCoinContract = new ethers.Contract(contractAddresses.stableCoin, stableCoinABI, signer);
      const vaultAddress = getVaultAddress();
      if (!vaultAddress) {
        alert("Vault address not found for selected NFT type.");
        return;
      }
      let tx = await stableCoinContract.approve(vaultAddress, depositWei);
      log("Approving vault to spend " + rawAmount + " tokens...");
      await tx.wait();
      log("Approval confirmed.");
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      tx = await vaultContract.deposit(depositWei, metaURI);
      log("Depositing stablecoins and minting Silverback NFT(s)...");
      await tx.wait();
      log("Deposit transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in deposit: " + err.message);
    }
  };

  const handleDepositTo = async () => {
    if (!depositRecipient || !ethers.utils.isAddress(depositRecipient)) {
      alert("Please enter a valid recipient address.");
      return;
    }
    if (!frontImageFile || !backImageFile) {
      alert("Please select both front and back images.");
      return;
    }
    try {
      const metaURI = await uploadMetadataToIPFS(frontImageFile, backImageFile);
      const depositWei = ethers.utils.parseEther("100");
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const stableCoinContract = new ethers.Contract(contractAddresses.stableCoin, stableCoinABI, signer);
      let approveTx = await stableCoinContract.approve(getVaultAddress(), depositWei);
      log("Approving vault for 100 tokens...");
      await approveTx.wait();
      log("Approval confirmed.");
      const vaultContract = new ethers.Contract(getVaultAddress(), vaultABI, signer);
      let tx = await vaultContract.depositTo(depositRecipient, depositWei, metaURI);
      log("Depositing stablecoins and minting Silverback NFT to " + depositRecipient + "...");
      await tx.wait();
      log("DepositTo transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in depositTo: " + err.message);
    }
  };

  // -------------------------------------
  // King Louis Deposit Functions
  // -------------------------------------
  const handleDepositKingLouis = async () => {
    if (!frontImageFile || !backImageFile) {
      alert("Please select both front and back images.");
      return;
    }
    try {
      const metaURI = await uploadMetadataToIPFS(frontImageFile, backImageFile);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultAddress = getVaultAddress();
      if (!vaultAddress) {
        alert("Vault address not found for selected NFT type.");
        return;
      }
      // Approve each token (for King Louis, tokens like WBTC, WETH, WLTC are required)
      const wbtcContract = new ethers.Contract(contractAddresses.wbtc, stableCoinABI, signer);
      const wethContract = new ethers.Contract(contractAddresses.weth, stableCoinABI, signer);
      const wltcContract = new ethers.Contract(contractAddresses.wltc, stableCoinABI, signer);
      await safeApprove(wbtcContract, "WBTC", vaultAddress, REQUIRED_WBTC);
      await safeApprove(wethContract, "WETH", vaultAddress, REQUIRED_WETH);
      await safeApprove(wltcContract, "WLTC", vaultAddress, REQUIRED_WLTC);
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      // Pass 0 as the dummy deposit amount for King Louis
      let tx = await vaultContract.deposit(0, metaURI);
      log("Depositing tokens and minting King Louis NFT...");
      await tx.wait();
      log("Deposit transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in King Louis deposit: " + err.message);
    }
  };

  const handleDepositToKingLouis = async () => {
    if (!depositRecipient || !ethers.utils.isAddress(depositRecipient)) {
      alert("Please enter a valid recipient address.");
      return;
    }
    if (!frontImageFile || !backImageFile) {
      alert("Please select both front and back images.");
      return;
    }
    try {
      const metaURI = await uploadMetadataToIPFS(frontImageFile, backImageFile);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultAddress = getVaultAddress();
      if (!vaultAddress) {
        alert("Vault address not found for selected NFT type.");
        return;
      }
      const wbtcContract = new ethers.Contract(contractAddresses.wbtc, stableCoinABI, signer);
      const wethContract = new ethers.Contract(contractAddresses.weth, stableCoinABI, signer);
      const wltcContract = new ethers.Contract(contractAddresses.wltc, stableCoinABI, signer);
      await safeApprove(wbtcContract, "WBTC", vaultAddress, REQUIRED_WBTC);
      await safeApprove(wethContract, "WETH", vaultAddress, REQUIRED_WETH);
      await safeApprove(wltcContract, "WLTC", vaultAddress, REQUIRED_WLTC);
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      // Pass 0 as the dummy deposit amount for King Louis
      let tx = await vaultContract.depositTo(depositRecipient, 0, metaURI);
      log("Depositing tokens and minting King Louis NFT to " + depositRecipient + "...");
      await tx.wait();
      log("DepositTo transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in King Louis depositTo: " + err.message);
    }
  };

  // -------------------------------------
  // CSV Batch Deposit Functions (Silverbacks & King Louis)
  // -------------------------------------
  const handleCSVDeposit = async () => {
    if (!csvFile) {
      alert("Please select a CSV file.");
      return;
    }
    try {
      const fileText = await csvFile.text();
      const rows = fileText.split("\n").filter((row) => row.trim() !== "");
      const recipients = [];
      const metadataURIs = [];
      const ipfsClient = create({ url: "https://silverbacksipfs.online/api/v0" });
      for (let row of rows) {
        const cols = row.split(",");
        if (cols.length < 3) continue;
        const recipient = cols[0].trim();
        const frontURL = cols[1].trim();
        const backURL = cols[2].trim();
        if (!ethers.utils.isAddress(recipient)) {
          log("Invalid address in CSV: " + recipient);
          continue;
        }
        const metadata = {
          name: "Silverback NFT",
          description: "An NFT representing a $100 bill.",
          image: frontURL,
          properties: { imageBack: backURL }
        };
        const metadataAdded = await ipfsClient.add(JSON.stringify(metadata));
        const metaURI = "ipfs://" + metadataAdded.path;
        recipients.push(recipient);
        metadataURIs.push(metaURI);
        log(`Processed CSV row for ${recipient}. Metadata URI: ${metaURI}`);
      }
      if (recipients.length === 0) {
        alert("No valid entries found in CSV.");
        return;
      }
      const totalDeposit = ethers.utils.parseEther((recipients.length * 100).toString());
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const stableCoinContract = new ethers.Contract(contractAddresses.stableCoin, stableCoinABI, signer);
      let tx = await stableCoinContract.approve(getVaultAddress(), totalDeposit);
      log("Approving vault for batch deposit of " + (recipients.length * 100) + " tokens...");
      await tx.wait();
      log("Approval confirmed.");
      const vaultContract = new ethers.Contract(getVaultAddress(), vaultABI, signer);
      tx = await vaultContract.batchDeposit(recipients, metadataURIs);
      log("Batch deposit transaction submitted for Silverback NFTs...");
      await tx.wait();
      log("Batch deposit transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in CSV deposit: " + err.message);
    }
  };

  const handleCSVDepositKingLouis = async () => {
    if (!csvFile) {
      alert("Please select a CSV file.");
      return;
    }
    try {
      const fileText = await csvFile.text();
      const rows = fileText.split("\n").filter((row) => row.trim() !== "");
      const recipients = [];
      const metadataURIs = [];
      const ipfsClient = create({ url: "https://silverbacksipfs.online/api/v0" });
      for (let row of rows) {
        const cols = row.split(",");
        if (cols.length < 3) continue;
        const recipient = cols[0].trim();
        const frontURL = cols[1].trim();
        const backURL = cols[2].trim();
        if (!ethers.utils.isAddress(recipient)) {
          log("Invalid address in CSV: " + recipient);
          continue;
        }
        const metadata = {
          name: "King Louis NFT",
          description: "A King Louis NFT with exclusive features.",
          image: frontURL,
          properties: { imageBack: backURL }
        };
        const metadataAdded = await ipfsClient.add(JSON.stringify(metadata));
        const metaURI = "ipfs://" + metadataAdded.path;
        recipients.push(recipient);
        metadataURIs.push(metaURI);
        log(`Processed CSV row for ${recipient}. Metadata URI: ${metaURI}`);
      }
      if (recipients.length === 0) {
        alert("No valid entries found in CSV.");
        return;
      }
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultAddress = getVaultAddress();
      if (!vaultAddress) {
        alert("Vault address not found for selected NFT type.");
        return;
      }
      // Calculate total token amounts required
      const totalWbtc = REQUIRED_WBTC.mul(recipients.length);
      const totalWeth = REQUIRED_WETH.mul(recipients.length);
      const totalWltc = REQUIRED_WLTC.mul(recipients.length);
      const wbtcContract = new ethers.Contract(contractAddresses.wbtc, stableCoinABI, signer);
      const wethContract = new ethers.Contract(contractAddresses.weth, stableCoinABI, signer);
      const wltcContract = new ethers.Contract(contractAddresses.wltc, stableCoinABI, signer);
      await safeApprove(wbtcContract, "WBTC", vaultAddress, totalWbtc);
      await safeApprove(wethContract, "WETH", vaultAddress, totalWeth);
      await safeApprove(wltcContract, "WLTC", vaultAddress, totalWltc);
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      let tx = await vaultContract.batchDeposit(recipients, metadataURIs);
      log("Batch deposit transaction submitted for King Louis NFTs...");
      await tx.wait();
      log("Batch deposit transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in CSV deposit: " + err.message);
    }
  };

  // -------------------------------------
  // Burn (Redeem) Function for NFTs
  // -------------------------------------
  const handleBurn = async (tokenId, type) => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      let vaultAddress;
      if (type === "silverbacks") {
        vaultAddress = contractAddresses.vault;
      } else if (type === "kinglouis") {
        vaultAddress = contractAddresses.multiTokenVault;
      }
      if (!vaultAddress) {
        alert("Vault address not found for NFT type: " + type);
        return;
      }
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      log(`Redeeming NFT tokenId ${tokenId} from ${type} vault...`);
      const tx = await vaultContract.redeem(tokenId);
      await tx.wait();
      log(`Redeem confirmed for tokenId ${tokenId}`);
      loadData();
    } catch (err) {
      log("Error redeeming NFT: " + err.message);
    }
  };

  // -------------------------------------
  // Keypair & Link Generation with QR Codes (Old Way)
  // -------------------------------------
  const handleGenerateKeys = async () => {
    let currentNetworkName = networkName;
    if (window.ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const net = await provider.getNetwork();
        const chainIdHex = "0x" + net.chainId.toString(16);
        currentNetworkName = chains[chainIdHex]?.chainName || networkName;
      } catch (e) {
        log("Error fetching current network: " + e.message);
      }
    }
    const count = parseInt(keysToGenerate);
    if (isNaN(count) || count <= 0) {
      alert("Please enter a valid number greater than 0");
      return;
    }
    const csvRows = ["address,privateKey,encryptedPrivateKey,encryptionKey,link"];
    const zip = new JSZip();
    const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
    const currentDomain = window.location.origin;
    for (let i = 0; i < count; i++) {
      const wallet = ethers.Wallet.createRandom();
      const encryptionKey = generateRandomString(8);
      const plainKey = wallet.privateKey.slice(2);
      const aesKey = CryptoJS.MD5(encryptionKey);
      const encrypted = CryptoJS.AES.encrypt(
        CryptoJS.enc.Hex.parse(plainKey),
        aesKey,
        { iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }
      );
      const encryptedPrivateKey = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
      const link = `${currentDomain}/?network=${currentNetworkName}&address=${wallet.address}&pk=${encryptedPrivateKey}`;
      csvRows.push(`${wallet.address},${wallet.privateKey},${encryptedPrivateKey},${encryptionKey},${link}`);
      const qrOptions = {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 256,
        color: { dark: "#000000", light: "#ffffff" }
      };
      const dataUrl = await QRCode.toDataURL(encryptionKey, qrOptions);
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      zip.file(`${wallet.address}.png`, base64Data, { base64: true });
    }
    const csvString = csvRows.join("\n");
    zip.file("keypairs.csv", csvString);
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipUrl = URL.createObjectURL(zipBlob);
    setGeneratedCSV(zipUrl);
    log(`Generated ${count} keypair(s) with AES-CTR encryption, CSV, and QR codes in ZIP.`);
  };

  const generateRandomString = (length) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // -------------------------------------
  // Test Decryption Handler
  // -------------------------------------
  const handleTestDecryption = () => {
    try {
      const urlObj = new URL(testURL);
      const encryptedPk = urlObj.searchParams.get("pk");
      if (!encryptedPk) {
        log("The provided URL does not contain a 'pk' parameter.");
        setTestDecryptedPrivateKey("Error: 'pk' parameter not found.");
        return;
      }
      if (!testDecryptionKey) {
        log("Please enter a decryption key.");
        setTestDecryptedPrivateKey("Error: No decryption key provided.");
        return;
      }
      const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
      const aesKey = CryptoJS.MD5(testDecryptionKey);
      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: CryptoJS.enc.Hex.parse(encryptedPk) },
        aesKey,
        { iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }
      );
      const decryptedHex = decrypted.toString(CryptoJS.enc.Hex);
      const fullDecryptedKey = "0x" + decryptedHex;
      setTestDecryptedPrivateKey(fullDecryptedKey);
      log("Decryption successful.");
    } catch (error) {
      log("Error during decryption: " + error.message);
      setTestDecryptedPrivateKey("Error during decryption.");
    }
  };

  // -------------------------------------
  // Render
  // -------------------------------------
  return (
    <div className="container">
      <h1 className="center-align">Admin Dashboard</h1>
      {/* Display connected wallet token balances */}
      <div style={{ marginBottom: "20px", padding: "10px", border: "1px solid #ccc", borderRadius: "4px" }}>
        <h5>Wallet Balances:</h5>
        <p>StableCoin: {stableCoinBalance}</p>
        <p>WBTC: {wbtcBalance}</p>
        <p>WETH: {wethBalance}</p>
        <p>WLTC: {wltcBalance}</p>
      </div>
      {/* Global NFT Type Dropdown */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ marginRight: "10px", fontWeight: "bold" }}>Select NFT Type:</label>
        <select value={nftType} onChange={(e) => setNftType(e.target.value)}>
          <option value="silverbacks">Silverbacks</option>
          <option value="kinglouis">King Louis</option>
        </select>
      </div>
      {/* Tab Navigation */}
      <div style={{ marginBottom: "20px" }}>
        <button onClick={() => setActiveTab("mintSelf")} style={activeTab === "mintSelf" ? activeTabButtonStyle : tabButtonStyle}>
          Mint Self
        </button>
        <button onClick={() => setActiveTab("mintRecipient")} style={activeTab === "mintRecipient" ? activeTabButtonStyle : tabButtonStyle}>
          Mint to Recipient
        </button>
        <button onClick={() => setActiveTab("batchMint")} style={activeTab === "batchMint" ? activeTabButtonStyle : tabButtonStyle}>
          Batch Mint
        </button>
        <button onClick={() => setActiveTab("nfts")} style={activeTab === "nfts" ? activeTabButtonStyle : tabButtonStyle}>
          Your NFTs
        </button>
        <button onClick={() => setActiveTab("generateKeys")} style={activeTab === "generateKeys" ? activeTabButtonStyle : tabButtonStyle}>
          Generate Keys
        </button>
        <button onClick={() => setActiveTab("testDecryption")} style={activeTab === "testDecryption" ? activeTabButtonStyle : tabButtonStyle}>
          Test Decryption
        </button>
      </div>
      <div>
        {activeTab === "mintSelf" && (
          <div>
            <div className="card">
              <div className="card-content">
                {nftType === "kinglouis" ? (
                  <>
                    <span className="card-title">Mint King Louis (to Self)</span>
                    <p>Your wallet will transfer 0.05 WBTC, 0.5 WETH, and 3 WLTC.</p>
                  </>
                ) : (
                  <>
                    <span className="card-title">Mint Silverbacks (to Self)</span>
                    <p>Deposit must be a multiple of 100. You’ll receive 1 NFT per $100 deposited.</p>
                    <div className="row">
                      <div className="input-field col s12 m4">
                        <input type="number" step="100" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                        <label className="active">Deposit Amount</label>
                      </div>
                    </div>
                  </>
                )}
                <div className="row">
                  <div className="col s12 m6">
                    <div className="file-field input-field">
                      <div className="btn">
                        <span>Front Image</span>
                        <input type="file" accept="image/*" onChange={(e) => {
                          if (e.target.files.length > 0) {
                            setFrontImageFile(e.target.files[0]);
                            log("Front image selected: " + e.target.files[0].name);
                          }
                        }} />
                      </div>
                      <div className="file-path-wrapper">
                        <input className="file-path validate" type="text" placeholder="Upload front image" />
                      </div>
                    </div>
                  </div>
                  <div className="col s12 m6">
                    <div className="file-field input-field">
                      <div className="btn">
                        <span>Back Image</span>
                        <input type="file" accept="image/*" onChange={(e) => {
                          if (e.target.files.length > 0) {
                            setBackImageFile(e.target.files[0]);
                            log("Back image selected: " + e.target.files[0].name);
                          }
                        }} />
                      </div>
                      <div className="file-path-wrapper">
                        <input className="file-path validate" type="text" placeholder="Upload back image" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="row">
                  {nftType === "kinglouis" ? (
                    <div className="col s12">
                      <button onClick={handleDepositKingLouis} className="btn waves-effect waves-light">
                        Deposit Tokens &amp; Mint King Louis NFT
                        <i className="material-icons right">send</i>
                      </button>
                    </div>
                  ) : (
                    <div className="col s12 m8">
                      <button onClick={handleDeposit} className="btn waves-effect waves-light">
                        Deposit &amp; Mint Silverback NFT
                        <i className="material-icons right">send</i>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === "mintRecipient" && (
          <div>
            <div className="card">
              <div className="card-content">
                {nftType === "kinglouis" ? (
                  <>
                    <span className="card-title">Mint King Louis to a Specific Address</span>
                    <p>Your wallet will transfer 0.05 WBTC, 0.5 WETH, and 3 WLTC.</p>
                  </>
                ) : (
                  <>
                    <span className="card-title">Mint Silverback to a Specific Address</span>
                    <p>Deposit exactly 100 stablecoins to mint a Silverback NFT to a chosen recipient.</p>
                  </>
                )}
                <div className="row">
                  <div className="input-field col s12">
                    <input type="text" placeholder="Recipient address" value={depositRecipient} onChange={(e) => setDepositRecipient(e.target.value)} />
                    <label className="active">Recipient Address</label>
                  </div>
                  <div className="col s12 m6">
                    <div className="file-field input-field">
                      <div className="btn">
                        <span>Front Image</span>
                        <input type="file" accept="image/*" onChange={(e) => {
                          if (e.target.files.length > 0) {
                            setFrontImageFile(e.target.files[0]);
                            log("Front image selected: " + e.target.files[0].name);
                          }
                        }} />
                      </div>
                      <div className="file-path-wrapper">
                        <input className="file-path validate" type="text" placeholder="Upload front image" />
                      </div>
                    </div>
                  </div>
                  <div className="col s12 m6">
                    <div className="file-field input-field">
                      <div className="btn">
                        <span>Back Image</span>
                        <input type="file" accept="image/*" onChange={(e) => {
                          if (e.target.files.length > 0) {
                            setBackImageFile(e.target.files[0]);
                            log("Back image selected: " + e.target.files[0].name);
                          }
                        }} />
                      </div>
                      <div className="file-path-wrapper">
                        <input className="file-path validate" type="text" placeholder="Upload back image" />
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={nftType === "kinglouis" ? handleDepositToKingLouis : handleDepositTo} className="btn waves-effect waves-light">
                  Deposit &amp; Mint to Recipient
                  <i className="material-icons right">send</i>
                </button>
              </div>
            </div>
          </div>
        )}
        {activeTab === "batchMint" && (
          <div>
            <div className="card">
              <div className="card-content">
                {nftType === "kinglouis" ? (
                  <>
                    <span className="card-title">Batch Mint King Louis from CSV</span>
                    <p>
                      Upload a CSV file with 3 columns: Recipient address, Front image URL, Back image URL.
                      Each row will trigger a deposit of 0.05 WBTC, 0.5 WETH, and 3 WLTC.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="card-title">Batch Mint Silverbacks from CSV</span>
                    <p>
                      Upload a CSV file with 3 columns: Recipient address, Front image URL, Back image URL.
                      Each row deposits $100 and mints a Silverback NFT.
                    </p>
                  </>
                )}
                <div className="file-field input-field">
                  <div className="btn">
                    <span>CSV File</span>
                    <input type="file" accept=".csv" onChange={(e) => {
                      if (e.target.files.length > 0) {
                        setCsvFile(e.target.files[0]);
                        log("CSV file selected: " + e.target.files[0].name);
                      }
                    }} />
                  </div>
                  <div className="file-path-wrapper">
                    <input className="file-path validate" type="text" placeholder="Upload CSV" />
                  </div>
                </div>
                <div className="row">
                  <div className="col s12">
                    <button onClick={nftType === "kinglouis" ? handleCSVDepositKingLouis : handleCSVDeposit} className="btn waves-effect waves-light">
                      Process CSV Batch Deposit
                      <i className="material-icons right">send</i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === "nfts" && (
          <div>
            <div className="card">
              <div className="card-content">
                <span className="card-title">Your NFTs</span>
                {nfts.length === 0 ? (
                  <p>No NFTs found.</p>
                ) : (
                  <div className="row">
                    {nfts.map((n) => (
                      <div key={n.tokenId + "-" + n.type} className="col s12 m6 l4">
                        <div className="card">
                          <div className="card-image">
                            {n.image ? (
                              <img src={n.image.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")} alt="NFT Front" style={{ height: "200px", objectFit: "cover" }} />
                            ) : (
                              <p>No image available.</p>
                            )}
                            <button
                              style={{
                                position: "absolute",
                                top: "10px",
                                right: "10px",
                                zIndex: 100,
                                pointerEvents: "auto",
                                backgroundColor: "rgba(0,0,0,0.6)",
                                color: "#fff",
                                border: "none",
                                padding: "5px 10px",
                                cursor: "pointer"
                              }}
                              onClick={() => {}}
                            >
                              Toggle
                            </button>
                            <div
                              style={{
                                position: "absolute",
                                bottom: "0",
                                left: "0",
                                backgroundColor: "rgba(0,0,0,0.5)",
                                color: "#fff",
                                padding: "5px",
                                fontSize: "14px"
                              }}
                            >
                              Token ID: {n.tokenId}
                            </div>
                          </div>
                          <div className="card-content">
                            <p><strong>Type:</strong> {n.type}</p>
                            <p><strong>Face Value:</strong> {n.faceValue} USD</p>
                          </div>
                          <div className="card-action" style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}>
                            <button onClick={() => handleBurn(n.tokenId, n.type)} className="btn red lighten-1">
                              Burn &amp; Redeem
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === "generateKeys" && (
          <div>
            <div className="card">
              <div className="card-content">
                <span className="card-title">Generate EVM Keypairs</span>
                <p>
                  Specify how many keypairs to generate and download them as a ZIP file.
                  The ZIP will include:
                </p>
                <ul>
                  <li>address</li>
                  <li>plain private key</li>
                  <li>AES‑CTR encrypted private key (hex)</li>
                  <li>the 8‑character encryption key</li>
                  <li>a link: <code>{`${window.location.origin}/?network=[calculated]&address=<address>&pk=<encryptedPrivateKey>`}</code></li>
                  <li>QR code PNG for each key (named with the wallet address)</li>
                </ul>
                <div className="row">
                  <div className="input-field col s12 m4">
                    <input type="number" min="1" value={keysToGenerate} onChange={(e) => setKeysToGenerate(e.target.value)} />
                    <label className="active">Number of Keypairs</label>
                  </div>
                  <div className="col s12 m4">
                    <button onClick={handleGenerateKeys} className="btn waves-effect waves-light">
                      Generate Keypairs
                      <i className="material-icons right">file_download</i>
                    </button>
                  </div>
                </div>
                {generatedCSV && (
                  <div style={{ marginTop: "20px" }}>
                    <a href={generatedCSV} download="keypairs.zip" className="btn">
                      Download ZIP
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === "testDecryption" && (
          <div>
            <div className="card">
              <div className="card-content">
                <span className="card-title">Test URL Decryption</span>
                <p>
                  Enter a URL containing a query parameter <code>pk</code> and a decryption key.
                  Clicking "Test Decryption" will decrypt the value of <code>pk</code> and display the private key.
                </p>
                <div className="row">
                  <div className="input-field col s12">
                    <input type="text" placeholder="Enter URL (e.g. http://example.com/?network=main&address=...&pk=...)" value={testURL} onChange={(e) => setTestURL(e.target.value)} />
                    <label className="active">URL</label>
                  </div>
                  <div className="input-field col s12">
                    <input type="text" placeholder="Enter decryption key" value={testDecryptionKey} onChange={(e) => setTestDecryptionKey(e.target.value)} />
                    <label className="active">Decryption Key</label>
                  </div>
                </div>
                <button onClick={handleTestDecryption} className="btn waves-effect waves-light">
                  Test Decryption
                  <i className="material-icons right">visibility</i>
                </button>
                {testDecryptedPrivateKey && (
                  <div style={{ marginTop: "20px", wordBreak: "break-all" }}>
                    <strong>Decrypted Private Key:</strong>
                    <p>{testDecryptedPrivateKey}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Debug Log Panel visible across all tabs */}
      <div className="card-panel grey darken-3" style={{ color: "white", marginTop: "20px" }}>
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

export default AdminPage;
