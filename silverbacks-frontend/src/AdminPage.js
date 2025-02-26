import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { create } from "ipfs-http-client";
import CryptoJS from "crypto-js"; // For encryption/decryption
import QRCode from "qrcode";       // For QR code generation
import JSZip from "jszip";         // For creating ZIP archives
import chains from "./chains.json";

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

// Helper function: generate a random alphanumeric string of specified length.
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Define the list of tabs we want to show.
const tabs = [
  { id: "mintSelf", label: "Mint Self" },
  { id: "mintRecipient", label: "Mint to Recipient" },
  { id: "batchMint", label: "Batch Mint" },
  { id: "nfts", label: "Your NFTs" },
  { id: "debug", label: "Debug Log" },
  { id: "generateKeys", label: "Generate Keys" }
];

const AdminPage = ({ currentAccount }) => {
  // Existing state variables
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

  // States for key generation functionality
  const [keysToGenerate, setKeysToGenerate] = useState("1");
  const [selectedNetwork, setSelectedNetwork] = useState("sepoliatestnet");
  const [generatedCSV, setGeneratedCSV] = useState(null);

  // Inline styles for tab buttons
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

  // Load contract addresses based on the connected network.
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

  // Load data when wallet and contracts are ready.
  const loadData = async () => {
    if (!currentAccount || !window.ethereum || !contractAddresses) return;
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

  // Updated keypair generation: generate keypairs and create a ZIP archive containing a CSV file and QR code PNGs.
  // The QR code files are now named using the wallet address.
  const handleGenerateKeys = async () => {
    const count = parseInt(keysToGenerate);
    if (isNaN(count) || count <= 0) {
      alert("Please enter a valid number greater than 0");
      return;
    }
    const csvRows = ["address,privateKey,encryptedPrivateKey,encryptionKey,link"];
    const zip = new JSZip();
    // Fixed IV for CTR mode (16 bytes of zeros)
    const iv = CryptoJS.enc.Hex.parse("00000000000000000000000000000000");
    for (let i = 0; i < count; i++) {
      const wallet = ethers.Wallet.createRandom();
      const encryptionKey = generateRandomString(8);
      // Remove "0x" prefix so that the plain key is 64 hex characters (32 bytes)
      const plainKey = wallet.privateKey.slice(2);
      // Derive a 128-bit AES key from the encryption key using MD5
      const aesKey = CryptoJS.MD5(encryptionKey);
      // Encrypt using AES in CTR mode with no padding
      const encrypted = CryptoJS.AES.encrypt(
        CryptoJS.enc.Hex.parse(plainKey),
        aesKey,
        { iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }
      );
      // Get ciphertext as hex string (64 characters)
      const encryptedPrivateKey = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
      // Compile the link using the selected network, wallet address, and the encrypted private key in the pk parameter.
      const link = `http://silverbacksethdenver2025.win/?network=${selectedNetwork}&address=${wallet.address}&pk=${encryptedPrivateKey}`;
      console.log("Generated link:", link);
      csvRows.push(`${wallet.address},${wallet.privateKey},${encryptedPrivateKey},${encryptionKey},${link}`);
      
      // Generate QR code for the encryption key
      const qrOptions = {
        errorCorrectionLevel: 'L',
        margin: 1,
        width: 256,
        color: { dark: "#000000", light: "#ffffff" }
      };
      const dataUrl = await QRCode.toDataURL(encryptionKey, qrOptions);
      // Remove the data URL header so we get base64 content only.
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      // Instead of naming the file with the encryptionKey, use the wallet address.
      zip.file(`${wallet.address}.png`, base64Data, { base64: true });
    }
    const csvString = csvRows.join("\n");
    zip.file("keypairs.csv", csvString);
    // Generate the ZIP blob.
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipUrl = URL.createObjectURL(zipBlob);
    setGeneratedCSV(zipUrl);
    log(`Generated ${count} keypair(s) with AES-CTR encryption, CSV, and QR codes in ZIP.`);
  };

  return (
    <div className="container">
      <h1 className="center-align">Admin Dashboard</h1>
      {/* Custom Tab Header */}
      <div style={{ marginBottom: "20px" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={activeTab === tab.id ? activeTabButtonStyle : tabButtonStyle}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Tab Content */}
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
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files.length > 0) {
                              setFrontImageFile(e.target.files[0]);
                              log("Front image selected: " + e.target.files[0].name);
                            }
                          }}
                        />
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
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files.length > 0) {
                              setBackImageFile(e.target.files[0]);
                              log("Back image selected: " + e.target.files[0].name);
                            }
                          }}
                        />
                      </div>
                      <div className="file-path-wrapper">
                        <input className="file-path validate" type="text" placeholder="Upload back image" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="row">
                  <div className="input-field col s12 m4">
                    <input
                      type="number"
                      step="100"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                    <label className="active">Deposit Amount</label>
                  </div>
                  <div className="col s12 m8">
                    <button onClick={() => {}} className="btn waves-effect waves-light">
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
                    <input
                      type="text"
                      placeholder="Recipient address"
                      value={depositRecipient}
                      onChange={(e) => setDepositRecipient(e.target.value)}
                    />
                    <label className="active">Recipient Address</label>
                  </div>
                  <div className="col s12 m6">
                    <div className="file-field input-field">
                      <div className="btn">
                        <span>Front Image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files.length > 0) {
                              setFrontImageFile(e.target.files[0]);
                              log("Front image selected: " + e.target.files[0].name);
                            }
                          }}
                        />
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
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files.length > 0) {
                              setBackImageFile(e.target.files[0]);
                              log("Back image selected: " + e.target.files[0].name);
                            }
                          }}
                        />
                      </div>
                      <div className="file-path-wrapper">
                        <input className="file-path validate" type="text" placeholder="Upload back image" />
                      </div>
                    </div>
                  </div>
                </div>
                <button onClick={() => {}} className="btn waves-effect waves-light">
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
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        if (e.target.files.length > 0) {
                          setCsvFile(e.target.files[0]);
                          log("CSV file selected: " + e.target.files[0].name);
                        }
                      }}
                    />
                  </div>
                  <div className="file-path-wrapper">
                    <input className="file-path validate" type="text" placeholder="Upload CSV" />
                  </div>
                </div>
                <button onClick={() => {}} className="btn waves-effect waves-light">
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
                              <img
                                src={n.image.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                                alt="NFT Front"
                                style={{ height: "200px", objectFit: "cover" }}
                              />
                            ) : (
                              <p>No image available.</p>
                            )}
                          </div>
                          <div className="card-content">
                            <p>
                              <strong>Token ID:</strong> {n.tokenId}
                            </p>
                            <p>
                              <strong>Face Value:</strong> {n.faceValue} USD
                            </p>
                          </div>
                          <div className="card-action">
                            <button onClick={() => {}} className="btn red lighten-1">
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
                  The ZIP includes:
                </p>
                <ul>
                  <li>address</li>
                  <li>plain private key</li>
                  <li>AES‑CTR encrypted private key (hex)</li>
                  <li>the 8‑character encryption key</li>
                  <li>a link: <code>http://silverbacksethdenver2025.win/?network=&lt;network&gt;&amp;address=&lt;address&gt;&amp;pk=&lt;encryptedPrivateKey&gt;</code></li>
                  <li>QR code PNGs for each key, named using the wallet address</li>
                </ul>
                <div className="row">
                  <div className="input-field col s12 m4">
                    <input
                      type="number"
                      min="1"
                      value={keysToGenerate}
                      onChange={(e) => setKeysToGenerate(e.target.value)}
                    />
                    <label className="active">Number of Keypairs</label>
                  </div>
                  <div className="input-field col s12 m4">
                    <input
                      type="text"
                      value={selectedNetwork}
                      onChange={(e) => setSelectedNetwork(e.target.value)}
                    />
                    <label className="active">Network</label>
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
      </div>
    </div>
  );
};

export default AdminPage;
