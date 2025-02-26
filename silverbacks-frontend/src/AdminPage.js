import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { create } from "ipfs-http-client";
import chains from "./chains.json";
import CryptoJS from "crypto-js";      // For AES encryption
import QRCode from "qrcode";           // For QR code generation
import JSZip from "jszip";             // For creating ZIP archives

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

const vaultABI = [
  "function deposit(uint256 depositAmount, string metadataURI) external",
  "function depositTo(address recipient, uint256 depositAmount, string metadataURI) external",
  "function batchDeposit(address[] recipients, string[] metadataURIs) external",
  "function redeem(uint256 tokenId) external"
];

const AdminPage = ({ currentAccount }) => {
  const [depositAmount, setDepositAmount] = useState("100");
  const [depositRecipient, setDepositRecipient] = useState("");
  const [frontImageFile, setFrontImageFile] = useState(null);
  const [backImageFile, setBackImageFile] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [nfts, setNfts] = useState([]);
  const [logMessages, setLogMessages] = useState([]);
  const [contractAddresses, setContractAddresses] = useState(null);
  const [erc20Balance, setErc20Balance] = useState(null);
  const [activeTab, setActiveTab] = useState("mintSelf");
  const [keysToGenerate, setKeysToGenerate] = useState("1");
  const [generatedCSV, setGeneratedCSV] = useState(null);
  const [networkName, setNetworkName] = useState("main");
  // New states for testing decryption
  const [testURL, setTestURL] = useState("");
  const [testDecryptionKey, setTestDecryptionKey] = useState("");
  const [testDecryptedPrivateKey, setTestDecryptedPrivateKey] = useState("");

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

  // Load contract addresses and set network name based on connected chain
  useEffect(() => {
    async function loadContractAddresses() {
      if (window.ethereum) {
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const network = await provider.getNetwork();
          let chainIdHex = "0x" + network.chainId.toString(16);
          if (chainIdHex === "0x1") {
            console.log("Mainnet detected in AdminPage. Switching to Sepolia testnet...");
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: "0xAA36A7" }],
            });
            const networkAfter = await provider.getNetwork();
            chainIdHex = "0x" + networkAfter.chainId.toString(16);
          }
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
    }
    loadContractAddresses();
  }, []);

  // Load stablecoin balance and NFT data for the connected account.
  const loadData = async () => {
    if (!currentAccount || !contractAddresses) return;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const stableCoinContract = new ethers.Contract(
      contractAddresses.stableCoin,
      stableCoinABI,
      provider
    );
    const nftContract = new ethers.Contract(
      contractAddresses.silverbacksNFT,
      nftABI,
      provider
    );
    try {
      const bal = await stableCoinContract.balanceOf(currentAccount);
      log("StableCoin balance (raw) = " + bal.toString());
      setErc20Balance(ethers.utils.formatEther(bal));
      const nftCount = await nftContract.balanceOf(currentAccount);
      log("You own " + nftCount.toNumber() + " Silverbacks NFTs.");
      const nftData = [];
      for (let i = 0; i < nftCount.toNumber(); i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(currentAccount, i);
        const faceValue = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`Token ID ${tokenId} metadata URI: ${tokenURI}`);
        let metadata = {};
        try {
          const response = await fetch(
            "https://silverbacksipfs.online/ipfs/" + tokenURI.slice(7)
          );
          metadata = await response.json();
        } catch (err) {
          log("Error fetching metadata for token " + tokenId + ": " + err.message);
        }
        nftData.push({
          tokenId: tokenId.toString(),
          faceValue: faceValue.toString(),
          image: metadata.image || null,
          imageBack: metadata.properties?.imageBack || null,
          name: metadata.name || "",
          description: metadata.description || ""
        });
      }
      setNfts(nftData);
    } catch (err) {
      log("Error loading admin data: " + err.message);
    }
  };

  useEffect(() => {
    if (currentAccount && contractAddresses) {
      loadData();
    }
  }, [currentAccount, contractAddresses]);

  // Helper: Upload images and metadata JSON to IPFS.
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
        name: "Silverback NFT",
        description: "An NFT representing a $100 bill.",
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

  // Handle deposit & mint for "Mint Self" tab.
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
      const stableCoinContract = new ethers.Contract(
        contractAddresses.stableCoin,
        stableCoinABI,
        signer
      );
      const vaultContract = new ethers.Contract(
        contractAddresses.vault,
        vaultABI,
        signer
      );
      let tx = await stableCoinContract.approve(contractAddresses.vault, depositWei);
      log("Approving vault to spend " + rawAmount + " tokens...");
      await tx.wait();
      log("Approval confirmed.");
      tx = await vaultContract.deposit(depositWei, metaURI);
      log("Depositing stablecoins and minting NFT(s)...");
      await tx.wait();
      log("Deposit transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in deposit: " + err.message);
    }
  };

  // Handle depositTo for "Mint to Recipient" tab.
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
      const stableCoinContract = new ethers.Contract(
        contractAddresses.stableCoin,
        stableCoinABI,
        signer
      );
      let approveTx = await stableCoinContract.approve(contractAddresses.vault, depositWei);
      log("Approving vault to spend 100 tokens...");
      await approveTx.wait();
      log("Approval confirmed.");
      const vaultContract = new ethers.Contract(
        contractAddresses.vault,
        vaultABI,
        signer
      );
      let tx = await vaultContract.depositTo(depositRecipient, depositWei, metaURI);
      log("Depositing stablecoins and minting NFT to " + depositRecipient + "...");
      await tx.wait();
      log("DepositTo transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in depositTo: " + err.message);
    }
  };

  // Handle CSV batch deposit for "Batch Mint" tab.
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
      const stableCoinContract = new ethers.Contract(
        contractAddresses.stableCoin,
        stableCoinABI,
        signer
      );
      let tx = await stableCoinContract.approve(contractAddresses.vault, totalDeposit);
      log("Approving vault for batch deposit of " + (recipients.length * 100) + " tokens...");
      await tx.wait();
      log("Approval confirmed.");
      const vaultContract = new ethers.Contract(
        contractAddresses.vault,
        vaultABI,
        signer
      );
      tx = await vaultContract.batchDeposit(recipients, metadataURIs);
      log("Batch deposit transaction submitted...");
      await tx.wait();
      log("Batch deposit transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in CSV deposit: " + err.message);
    }
  };

  // Handle burning (redeeming) an NFT.
  const handleBurn = async (tokenId) => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(contractAddresses.vault, vaultABI, signer);
      log("Burning NFT tokenId: " + tokenId + " to redeem stablecoins...");
      const tx = await vaultContract.redeem(tokenId);
      await tx.wait();
      log("Redeem transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error burning NFT: " + err.message);
    }
  };

  // --- New: Keypair & Link Generation with QR Codes ---
  const handleGenerateKeys = async () => {
    const count = parseInt(keysToGenerate);
    if (isNaN(count) || count <= 0) {
      alert("Please enter a valid number greater than 0");
      return;
    }
    const csvRows = ["address,privateKey,encryptedPrivateKey,encryptionKey,link"];
    const zip = new JSZip();
    const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
    // Use the current domain dynamically
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
      // Build the link using the dynamic domain and networkName
      const link = `${currentDomain}/?network=${networkName}&address=${wallet.address}&pk=${encryptedPrivateKey}`;
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

  // --- New: Test Decryption Handler ---
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

  return (
    <div className="container">
      <h1 className="center-align">Admin Dashboard</h1>
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
        <button onClick={() => setActiveTab("debug")} style={activeTab === "debug" ? activeTabButtonStyle : tabButtonStyle}>
          Debug Log
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
                <span className="card-title">Mint Silverbacks (to Self)</span>
                <p>Deposit must be a multiple of 100. You’ll receive 1 NFT per $100 deposited.</p>
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
                  <div className="input-field col s12 m4">
                    <input type="number" step="100" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                    <label className="active">Deposit Amount</label>
                  </div>
                  <div className="col s12 m8">
                    <button onClick={handleDeposit} className="btn waves-effect waves-light">
                      Deposit &amp; Mint
                      <i className="material-icons right">send</i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === "mintRecipient" && (
          <div>
            <div className="card">
              <div className="card-content">
                <span className="card-title">Mint Silverback to a Specific Address</span>
                <p>Deposit exactly 100 stablecoins to mint a Silverback NFT to a chosen recipient.</p>
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
                <button onClick={handleDepositTo} className="btn waves-effect waves-light">
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
                <span className="card-title">Batch Mint from CSV</span>
                <p>
                  Upload a CSV file with 3 columns: Recipient address, Front image URL, Back image URL.
                  Each row deposits $100 and mints an NFT.
                </p>
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
                <button onClick={handleCSVDeposit} className="btn waves-effect waves-light">
                  Process CSV Batch Deposit
                  <i className="material-icons right">send</i>
                </button>
              </div>
            </div>
          </div>
        )}
        {activeTab === "nfts" && (
          <div>
            <div className="card">
              <div className="card-content">
                <span className="card-title">Your Silverbacks NFTs</span>
                {nfts.length === 0 ? (
                  <p>No Silverbacks NFTs found.</p>
                ) : (
                  <div className="row">
                    {nfts.map((n) => (
                      <div key={n.tokenId} className="col s12 m6 l4">
                        <div className="card">
                          <div className="card-image">
                            {n.image ? (
                              <img src={n.image.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")} alt="NFT Front" style={{ height: "200px", objectFit: "cover" }} />
                            ) : (
                              <p>No image available.</p>
                            )}
                          </div>
                          <div className="card-content">
                            <p><strong>Token ID:</strong> {n.tokenId}</p>
                            <p><strong>Face Value:</strong> {n.faceValue} USD</p>
                          </div>
                          <div className="card-action">
                            <button onClick={() => handleBurn(n.tokenId)} className="btn red lighten-1">
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
        {activeTab === "debug" && (
          <div>
            <div className="card-panel grey darken-3" style={{ color: "white" }}>
              <h5>Debug Log</h5>
              {logMessages.map((msg, idx) => (
                <p key={idx} style={{ fontFamily: "monospace", margin: "0.2rem 0" }}>
                  {msg}
                </p>
              ))}
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
      <div className="card-panel grey darken-3" style={{ color: "white" }}>
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
