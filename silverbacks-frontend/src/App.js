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
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)"
];

const vaultABI = [
  "function deposit(uint256 depositAmount, string metadataURI) external",
  "function redeem(uint256 tokenId) external"
];

/*
  Create an IPFS client using your node’s API endpoint.
  Update the URL to use HTTPS and the API reverse proxy path (/api/v0).
*/
const ipfsClient = create({ url: "https://silverbacksipfs.online/api/v0" });

// Maximum file size allowed (5 MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB in bytes

function App() {
  const [currentAccount, setCurrentAccount] = useState(null);
  const [stableCoinBalance, setStableCoinBalance] = useState("0");
  // Array of objects: { tokenId, faceValue, image, imageBack, name, description }
  const [nfts, setNfts] = useState([]);
  const [depositAmount, setDepositAmount] = useState("100");
  const [logMessages, setLogMessages] = useState([]);

  // New states for image upload:
  const [frontImageFile, setFrontImageFile] = useState(null);
  const [backImageFile, setBackImageFile] = useState(null);

  // New states for NFT transfer:
  const [transferAddresses, setTransferAddresses] = useState({});
  const [transferVisible, setTransferVisible] = useState({});

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
          // Use the HTTPS gateway to fetch the metadata JSON.
          // Remove the "ipfs://" prefix and prepend the HTTPS gateway URL.
          const response = await fetch("https://silverbacksipfs.online/ipfs/" + tokenURI.slice(7));
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
      // --- Upload images and metadata to IPFS via your node ---
      const frontAdded = await ipfsClient.add(frontImageFile);
      const frontImageCID = frontAdded.path;
      log("Front image uploaded with CID: " + frontImageCID);
      
      const backAdded = await ipfsClient.add(backImageFile);
      const backImageCID = backAdded.path;
      log("Back image uploaded with CID: " + backImageCID);
      
      // Update metadata to follow OpenSea metadata standard:
      // Use 'image' as the primary image and include the back image in properties.
      const metadata = {
        name: "Silverback NFT",
        description: "An NFT representing a $100 bill.",
        image: "ipfs://" + frontImageCID,
        properties: {
          imageBack: "ipfs://" + backImageCID
        }
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

  const handleTransfer = async (tokenId) => {
    const recipient = transferAddresses[tokenId];
    if (!recipient || !ethers.utils.isAddress(recipient)) {
      alert("Please enter a valid Ethereum address for transfer.");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(silverbacksNftAddress, nftABI, signer);
      log("Transferring NFT tokenId " + tokenId + " to " + recipient + "...");
      const tx = await nftContract["safeTransferFrom(address,address,uint256)"](currentAccount, recipient, tokenId);
      await tx.wait();
      log("Transfer transaction confirmed for tokenId " + tokenId);
      await loadData();
    } catch (err) {
      console.error("Error transferring NFT:", err);
      log("Error transferring NFT: " + err.message);
    }
  };

  const handleFrontImageChange = (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > MAX_FILE_SIZE) {
        alert("Front image is too large. Please select an image smaller than 5 MB.");
        return;
      }
      setFrontImageFile(file);
      log("Front image selected: " + file.name);
    }
  };

  const handleBackImageChange = (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > MAX_FILE_SIZE) {
        alert("Back image is too large. Please select an image smaller than 5 MB.");
        return;
      }
      setBackImageFile(file);
      log("Back image selected: " + file.name);
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
              <p>
                Wallet Connected: <b>{currentAccount}</b>
              </p>
              <p>
                Your StableCoin Balance: <b>{stableCoinBalance}</b> MSC
              </p>
              <hr />
              <h2>Mint Silverbacks</h2>
              <p>
                Deposit must be a multiple of 100. You’ll receive 1 NFT per each $100 deposited.
              </p>
              <div style={{ marginBottom: "1rem" }}>
                <input type="file" accept="image/*" onChange={handleFrontImageChange} />
                <br />
                <br />
                <input type="file" accept="image/*" onChange={handleBackImageChange} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <input
                  type="number"
                  step="100"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
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
                      <p>
                        <b>Token ID:</b> {n.tokenId}
                      </p>
                      <p>
                        <b>Face Value:</b> {n.faceValue} USD
                      </p>
                      {n.image ? (
                        <div>
                          <img
                            src={n.image.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                            alt="NFT Front"
                            style={{ width: "100%" }}
                          />
                          {n.imageBack && (
                            <img
                              src={n.imageBack.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                              alt="NFT Back"
                              style={{ width: "100%", marginTop: "0.5rem" }}
                            />
                          )}
                        </div>
                      ) : (
                        <p>No images available.</p>
                      )}
                      <button onClick={() => handleBurn(n.tokenId)}>Burn & Redeem</button>
                      <button
                        onClick={() =>
                          setTransferVisible({
                            ...transferVisible,
                            [n.tokenId]: !transferVisible[n.tokenId]
                          })
                        }
                        style={{ marginTop: "0.5rem" }}
                      >
                        {transferVisible[n.tokenId] ? "Cancel Transfer" : "Transfer NFT"}
                      </button>
                      {transferVisible[n.tokenId] && (
                        <div style={{ marginTop: "0.5rem" }}>
                          <input
                            type="text"
                            placeholder="Recipient address"
                            value={transferAddresses[n.tokenId] || ""}
                            onChange={(e) =>
                              setTransferAddresses({
                                ...transferAddresses,
                                [n.tokenId]: e.target.value
                              })
                            }
                            style={{ marginBottom: "0.5rem", width: "100%" }}
                          />
                          <button onClick={() => handleTransfer(n.tokenId)}>Confirm Transfer</button>
                        </div>
                      )}
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
            <p key={idx} style={{ margin: 0, fontFamily: "monospace" }}>
              {msg}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
