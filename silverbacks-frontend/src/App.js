import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { create } from "ipfs-http-client";

// Replace with your actual deployed contract addresses:
const stableCoinAddress = "0x9939591954046BD6bc5c67511fa4B1A76e42175e";
const silverbacksNftAddress = "0xEf1060004B5e9063503c3e1e899f304E53822D3b";
const vaultAddress = "0x99B3206Ab7fAb39CffBa9fC496CbbD21fC170B98";

// Minimal ABI snippets:
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
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const vaultABI = [
  "function deposit(uint256 depositAmount, string metadataURI) external",
  "function redeem(uint256 tokenId) external"
];

// Create an IPFS client pointing to your QuickNode IPFS endpoint.
const ipfsClient = create({ url: "https://rays-automobile-clearly.quicknode-ipfs.com" });

function App() {
  const [currentAccount, setCurrentAccount] = useState(null);
  const [stableCoinBalance, setStableCoinBalance] = useState("0");
  // Array of objects: { tokenId, faceValue, imageFront, imageBack, name, description }
  const [nfts, setNfts] = useState([]);
  const [depositAmount, setDepositAmount] = useState("100");
  const [logMessages, setLogMessages] = useState([]);

  // New states for image upload:
  const [frontImageFile, setFrontImageFile] = useState(null);
  const [backImageFile, setBackImageFile] = useState(null);

  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask is not installed!");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setCurrentAccount(accounts[0]);
      log("Wallet connected: " + accounts[0]);
      await ensureSepoliaNetwork();
    } catch (err) {
      console.error("Error connecting wallet:", err);
      log("Error connecting wallet: " + err.message);
    }
  };

  const ensureSepoliaNetwork = async () => {
    if (!window.ethereum) return;
    try {
      const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
      if (chainIdHex.toLowerCase() !== "0xaa36a7") {
        log("User is not on Sepolia. Attempting to switch or add the network...");
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }]
          });
          log("Network switched to Sepolia successfully.");
        } catch (switchError) {
          if (switchError.code === 4902) {
            log("Sepolia not found in MetaMask. Trying to add...");
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: "0xaa36a7",
                  chainName: "Sepolia Test Network",
                  nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://rpc.sepolia.org"],
                  blockExplorerUrls: ["https://sepolia.etherscan.io"]
                }]
              });
              log("Sepolia added. Please switch to it in MetaMask and reconnect.");
            } catch (addError) {
              console.error("Error adding Sepolia to MetaMask:", addError);
            }
          } else {
            console.error("Error switching to Sepolia:", switchError);
          }
        }
      } else {
        log("Already on Sepolia network.");
      }
    } catch (err) {
      console.error("Error fetching chainId:", err);
    }
  };

  const loadData = async () => {
    if (!currentAccount || !window.ethereum) return;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const stableCoinContract = new ethers.Contract(stableCoinAddress, stableCoinABI, provider);
    const nftContract = new ethers.Contract(silverbacksNftAddress, nftABI, provider);
    try {
      const bal = await stableCoinContract.balanceOf(currentAccount);
      log("StableCoin balance (raw) = " + bal.toString());
      setStableCoinBalance(ethers.utils.formatEther(bal));
      const nftCount = await nftContract.balanceOf(currentAccount);
      const countNum = nftCount.toNumber();
      log("You own " + countNum + " Silverbacks NFTs.");
      const nftData = [];
      for (let i = 0; i < countNum; i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(currentAccount, i);
        const faceValue = await nftContract.faceValue(tokenId);
        const tokenURI = await nftContract.tokenURI(tokenId);
        log(`Token ID ${tokenId} metadata URI: ${tokenURI}`);
        let metadata = {};
        try {
          const response = await fetch(tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/"));
          metadata = await response.json();
        } catch (err) {
          log("Error fetching metadata for token " + tokenId + ": " + err.message);
        }
        nftData.push({
          tokenId: tokenId.toString(),
          faceValue: faceValue.toString(),
          imageFront: metadata.imageFront || null,
          imageBack: metadata.imageBack || null,
          name: metadata.name || "",
          description: metadata.description || ""
        });
      }
      setNfts(nftData);
    } catch (err) {
      console.error("Error loading data:", err);
      log("Error loading data: " + err.message);
    }
  };

  const handleDeposit = async () => {
    if (!currentAccount) {
      alert("Please connect wallet first.");
      return;
    }
    // Ensure both images are selected
    if (!frontImageFile || !backImageFile) {
      alert("Please select both front and back images.");
      return;
    }
    const rawAmount = depositAmount.trim();
    if (!rawAmount || isNaN(Number(rawAmount))) {
      alert("Invalid deposit amount.");
      return;
    }
    if (Number(rawAmount) % 100 !== 0) {
      alert("Deposit must be a multiple of 100!");
      return;
    }
    if (Number(rawAmount) > Number(stableCoinBalance)) {
      alert("You do not have enough stablecoins!");
      return;
    }
    try {
      // --- Upload images and metadata to IPFS ---
      // Upload front image
      const frontAdded = await ipfsClient.add(frontImageFile);
      const frontImageCID = frontAdded.path;
      log("Front image uploaded with CID: " + frontImageCID);
      // Upload back image
      const backAdded = await ipfsClient.add(backImageFile);
      const backImageCID = backAdded.path;
      log("Back image uploaded with CID: " + backImageCID);
      // Create metadata JSON
      const metadata = {
        name: "Silverback NFT",
        description: "An NFT representing a $100 bill with two images.",
        imageFront: "ipfs://" + frontImageCID,
        imageBack: "ipfs://" + backImageCID
      };
      const metadataString = JSON.stringify(metadata);
      const metadataAdded = await ipfsClient.add(metadataString);
      const metadataCID = metadataAdded.path;
      const metaURI = "ipfs://" + metadataCID;
      log("Metadata JSON uploaded with URI: " + metaURI);

      // --- Proceed with deposit ---
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const stableCoinContract = new ethers.Contract(stableCoinAddress, stableCoinABI, signer);
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      const depositWei = ethers.utils.parseEther(rawAmount);
      let tx = await stableCoinContract.approve(vaultAddress, depositWei);
      log("Approving vault to spend " + rawAmount + " tokens...");
      await tx.wait();
      log("Approval transaction confirmed.");
      tx = await vaultContract.deposit(depositWei, metaURI);
      log("Depositing stablecoins and minting Silverbacks NFTs...");
      await tx.wait();
      log("Deposit transaction confirmed!");
      await loadData();
    } catch (err) {
      console.error("Error in deposit:", err);
      log("Error in deposit: " + err.message);
    }
  };

  const handleBurn = async (tokenId) => {
    if (!currentAccount) {
      alert("Please connect wallet first.");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      log("Burning NFT tokenId: " + tokenId + " to redeem stablecoins...");
      const tx = await vaultContract.redeem(tokenId);
      await tx.wait();
      log("Redeem transaction confirmed!");
      await loadData();
    } catch (err) {
      console.error("Error burning NFT:", err);
      log("Error burning NFT: " + err.message);
    }
  };

  // --- Handlers for file inputs in the mint section ---
  const handleFrontImageChange = (e) => {
    if (e.target.files.length > 0) {
      setFrontImageFile(e.target.files[0]);
      log("Front image selected: " + e.target.files[0].name);
    }
  };

  const handleBackImageChange = (e) => {
    if (e.target.files.length > 0) {
      setBackImageFile(e.target.files[0]);
      log("Back image selected: " + e.target.files[0].name);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          setCurrentAccount(accounts[0]);
          log("Account changed to: " + accounts[0]);
        } else {
          setCurrentAccount(null);
          log("No accounts available.");
        }
      });
      window.ethereum.on("chainChanged", (_chainId) => {
        log("Chain changed to: " + _chainId);
        window.location.reload();
      });
    }
  }, []);

  useEffect(() => {
    if (currentAccount) {
      loadData();
    }
  }, [currentAccount]);

  return (
    <div>
      <header>
        <h1>Silverbacks Frontend</h1>
      </header>
      <main>
        <div className="container">
          {!currentAccount ? (
            <div>
              <p>Connect your wallet to begin.</p>
              <button onClick={connectWallet}>Connect MetaMask</button>
            </div>
          ) : (
            <div>
              <p>Wallet Connected: <b>{currentAccount}</b></p>
              <p>Your StableCoin Balance: <b>{stableCoinBalance}</b> MSC</p>
              <hr />
              <h2>Mint Silverbacks</h2>
              <p>Deposit must be a multiple of 100. You’ll receive 1 NFT per each $100 deposited.</p>
              {/* File inputs for images are now integrated here */}
              <div style={{ marginBottom: "1rem" }}>
                <input type="file" accept="image/*" onChange={handleFrontImageChange} />
                <br /><br />
                <input type="file" accept="image/*" onChange={handleBackImageChange} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <input type="number" step="100" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
                <button onClick={handleDeposit}>Deposit & Mint</button>
              </div>
              <hr />
              <h2>Your Silverbacks NFTs</h2>
              {nfts.length === 0 ? (
                <p>You have no Silverbacks NFTs.</p>
              ) : (
                <div className="nft-grid">
                  {nfts.map((n) => (
                    <div key={n.tokenId} className="nft-card">
                      <p><b>Token ID:</b> {n.tokenId}</p>
                      <p><b>Face Value:</b> {n.faceValue} USD</p>
                      {n.imageFront && n.imageBack ? (
                        <div>
                          <img src={n.imageFront.replace("ipfs://", "https://ipfs.io/ipfs/")} alt="Front" style={{ width: "100%", marginBottom: "0.5rem" }} />
                          <img src={n.imageBack.replace("ipfs://", "https://ipfs.io/ipfs/")} alt="Back" style={{ width: "100%" }} />
                        </div>
                      ) : (
                        <p>No images available.</p>
                      )}
                      <button onClick={() => handleBurn(n.tokenId)}>Burn & Redeem</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <footer>
        <p>Silverbacks Vault Demo &copy; 2025</p>
      </footer>
      <div style={{ backgroundColor: "#333", color: "#fff", padding: "0.5rem" }}>
        <h3>Debug Log</h3>
        <div style={{ maxHeight: "200px", overflowY: "auto" }}>
          {logMessages.map((msg, idx) => (
            <p key={idx} style={{ margin: 0, fontFamily: "monospace" }}>{msg}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
