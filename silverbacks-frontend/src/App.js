import React, { useEffect, useState } from "react";
import { ethers } from "ethers";

// NOTE: Put your actual contract addresses here:
const stableCoinAddress = "0x0C3a2419E2885B52B6E468cE24A0101160dF2215";
const silverbacksNftAddress = "0xcfB147dadF551265872B70aF26B99A3560bd0Bc0";
const vaultAddress = "0xf89155d3aBD782B41B9C6804d76f7ea61032A676";

// Minimal ABI snippets
const stableCoinABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const nftABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function faceValue(uint256 tokenId) view returns (uint256)",
];

const vaultABI = [
  "function deposit(uint256 depositAmount) external",
  "function redeem(uint256 tokenId) external",
];

function App() {
  const [currentAccount, setCurrentAccount] = useState(null);
  const [stableCoinBalance, setStableCoinBalance] = useState("0");
  const [nfts, setNfts] = useState([]); // Array of { tokenId, faceValue }
  const [depositAmount, setDepositAmount] = useState("100"); // Must be multiples of 100
  const [logMessages, setLogMessages] = useState([]);

  // Helper: push logs to state and console
  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  // Connect wallet on button click
  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask is not installed!");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setCurrentAccount(accounts[0]);
      log("Wallet connected: " + accounts[0]);

      // Check network
      await ensureSepoliaNetwork();
    } catch (err) {
      console.error("Error connecting wallet:", err);
      log("Error connecting wallet: " + err.message);
    }
  };

  // Ensures user is on Sepolia or tries to switch/add it
  const ensureSepoliaNetwork = async () => {
    if (!window.ethereum) return;
    try {
      const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
      if (chainIdHex.toLowerCase() !== "0xaa36a7") {
        // chainId 11155111 decimal = 0xaa36a7 hex
        log("User is not on Sepolia. Attempting to switch or add the network...");
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }],
          });
          log("Network switched to Sepolia successfully.");
        } catch (switchError) {
          // If the chain hasn't been added to MetaMask, add it
          if (switchError.code === 4902) {
            log("Sepolia not found in MetaMask. Trying to add...");
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: "0xaa36a7",
                  chainName: "Sepolia Test Network",
                  nativeCurrency: {
                    name: "SepoliaETH",
                    symbol: "ETH",
                    decimals: 18
                  },
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

  // Load stablecoin balance & NFT data
  const loadData = async () => {
    if (!currentAccount) return;
    if (!window.ethereum) return;

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const stableCoinContract = new ethers.Contract(stableCoinAddress, stableCoinABI, provider);
    const nftContract = new ethers.Contract(silverbacksNftAddress, nftABI, provider);

    try {
      const bal = await stableCoinContract.balanceOf(currentAccount);
      log("StableCoin balance (raw) = " + bal.toString());
      setStableCoinBalance(ethers.utils.formatEther(bal));

      // Fetch NFT info
      const nftCount = await nftContract.balanceOf(currentAccount);
      const countNum = nftCount.toNumber();
      log("You own " + countNum + " Silverbacks NFTs.");
      const nftData = [];
      for (let i = 0; i < countNum; i++) {
        const tokenId = await nftContract.tokenOfOwnerByIndex(currentAccount, i);
        const faceValue = await nftContract.faceValue(tokenId);
        nftData.push({
          tokenId: tokenId.toString(),
          faceValue: faceValue.toString()
        });
      }
      setNfts(nftData);
    } catch (err) {
      console.error("Error loading data:", err);
      log("Error loading data: " + err.message);
    }
  };

  // Deposit stablecoins (in multiples of 100)
  const handleDeposit = async () => {
    if (!currentAccount) {
      alert("Please connect wallet first.");
      return;
    }
    const rawAmount = depositAmount.trim();
    if (!rawAmount || isNaN(Number(rawAmount))) {
      alert("Invalid deposit amount.");
      return;
    }
    // Ensure multiple of 100
    if (Number(rawAmount) % 100 !== 0) {
      alert("Deposit must be a multiple of 100!");
      return;
    }

    // Check user balance first
    if (Number(rawAmount) > Number(stableCoinBalance)) {
      alert("You do not have enough stablecoins!");
      return;
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const stableCoinContract = new ethers.Contract(stableCoinAddress, stableCoinABI, signer);
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);

      // Convert to 18 decimals
      const depositWei = ethers.utils.parseEther(rawAmount);
      // Approve vault to spend depositWei
      let tx = await stableCoinContract.approve(vaultAddress, depositWei);
      log("Approving vault to spend " + rawAmount + " tokens...");
      await tx.wait();
      log("Approval transaction confirmed.");

      // Now call vault.deposit
      tx = await vaultContract.deposit(depositWei);
      log("Depositing stablecoins to mint Silverbacks NFTs...");
      await tx.wait();
      log("Deposit transaction confirmed!");

      // Reload data
      await loadData();
    } catch (err) {
      console.error("Error in deposit:", err);
      log("Error in deposit: " + err.message);
    }
  };

  // Burn NFT
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

      // Reload data
      await loadData();
    } catch (err) {
      console.error("Error burning NFT:", err);
      log("Error burning NFT: " + err.message);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      // When user changes accounts or network, reload relevant data
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
        // Reload page or data
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
          {!currentAccount && (
            <div>
              <p>Connect your wallet to begin.</p>
              <button onClick={connectWallet}>Connect MetaMask</button>
            </div>
          )}
          {currentAccount && (
            <div>
              <p>
                Wallet Connected: <b>{currentAccount}</b>
              </p>
              <p>
                Your StableCoin Balance: <b>{stableCoinBalance}</b> MSC
              </p>
              <hr />
              <h2>Mint Silverbacks</h2>
              <p>Deposit must be a multiple of 100. You’ll receive 1 NFT per each $100 deposited.</p>
              <input
                type="number"
                step="100"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
              <button onClick={handleDeposit}>Deposit & Mint</button>
              <hr />
              <h2>Your Silverbacks NFTs</h2>
              {nfts.length === 0 && <p>You have no Silverbacks NFTs.</p>}
              {nfts.length > 0 && (
                <div className="nft-grid">
                  {nfts.map((n) => (
                    <div key={n.tokenId} className="nft-card">
                      <p>
                        <b>Token ID:</b> {n.tokenId}
                      </p>
                      <p>
                        <b>Face Value:</b> {n.faceValue} USD
                      </p>
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

      {/* 
         Show debug logs for convenience
      */}
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
