import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { create } from "ipfs-http-client";
import chains from "./chains.json";

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
  "function depositTo(address recipient, uint256 depositAmount, string metadataURI) external",
  "function batchDeposit(address[] recipients, string[] metadataURIs) external",
  "function redeem(uint256 tokenId) external"
];

const ipfsClient = create({ url: "https://silverbacksipfs.online/api/v0" });
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

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

  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

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
      const frontAdded = await ipfsClient.add(frontImageFile);
      const frontImageCID = frontAdded.path;
      log("Front image uploaded with CID: " + frontImageCID);
      const backAdded = await ipfsClient.add(backImageFile);
      const backImageCID = backAdded.path;
      log("Back image uploaded with CID: " + backImageCID);
      const metadata = {
        name: "Silverback NFT",
        description: "An NFT representing a $100 bill.",
        image: "ipfs://" + frontImageCID,
        properties: { imageBack: "ipfs://" + backImageCID }
      };
      const metadataString = JSON.stringify(metadata);
      const metadataAdded = await ipfsClient.add(metadataString);
      const metadataCID = metadataAdded.path;
      const metaURI = "ipfs://" + metadataCID;
      log("Metadata JSON uploaded with URI: " + metaURI);
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
      const depositWei = ethers.utils.parseEther(rawAmount);
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
      const frontAdded = await ipfsClient.add(frontImageFile);
      const frontImageCID = frontAdded.path;
      log("Front image uploaded with CID: " + frontImageCID);
      const backAdded = await ipfsClient.add(backImageFile);
      const backImageCID = backAdded.path;
      log("Back image uploaded with CID: " + backImageCID);
      const metadata = {
        name: "Silverback NFT",
        description: "An NFT representing a $100 bill.",
        image: "ipfs://" + frontImageCID,
        properties: { imageBack: "ipfs://" + backImageCID }
      };
      const metadataString = JSON.stringify(metadata);
      const metadataAdded = await ipfsClient.add(metadataString);
      const metadataCID = metadataAdded.path;
      const metaURI = "ipfs://" + metadataCID;
      log("Metadata JSON uploaded with URI: " + metaURI);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const depositWei = ethers.utils.parseEther("100");
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

  const handleTransfer = async (tokenId) => {
    const recipient = prompt("Enter recipient address:");
    if (!recipient || !ethers.utils.isAddress(recipient)) {
      alert("Invalid Ethereum address.");
      return;
    }
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(contractAddresses.silverbacksNFT, nftABI, signer);
      log("Transferring NFT tokenId " + tokenId + " to " + recipient + "...");
      const tx = await nftContract["safeTransferFrom(address,address,uint256)"](currentAccount, recipient, tokenId);
      await tx.wait();
      log("Transfer transaction confirmed for tokenId " + tokenId);
      loadData();
    } catch (err) {
      log("Error transferring NFT: " + err.message);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          log("Account changed to: " + accounts[0]);
        }
      });
      window.ethereum.on("chainChanged", (_chainId) => {
        log("Chain changed to: " + _chainId);
        window.location.reload();
      });
    }
  }, []);

  return (
    <div className="container">
      <h1 className="center-align">Admin Dashboard</h1>
      {currentAccount ? (
        <>
          <div className="card-panel teal lighten-4">
            <p>
              Wallet Connected: <strong>{currentAccount}</strong>
            </p>
            {contractAddresses && (
              <>
                <p>
                  <strong>ERC20 (StableCoin) Address:</strong> {contractAddresses.stableCoin}
                </p>
                <p>
                  <strong>ERC721 (SilverbacksNFT) Address:</strong> {contractAddresses.silverbacksNFT}
                </p>
                {erc20Balance !== null && (
                  <p>
                    <strong>Your ERC20 Balance:</strong> {erc20Balance} tokens
                  </p>
                )}
              </>
            )}
          </div>

          {/* Mint Silverbacks (to Self) */}
          <div className="card">
            <div className="card-content">
              <span className="card-title">Mint Silverbacks (to Self)</span>
              <p>
                Deposit must be a multiple of 100. You’ll receive 1 NFT per $100 deposited.
              </p>
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
                  <button onClick={handleDeposit} className="btn waves-effect waves-light">
                    Deposit &amp; Mint
                    <i className="material-icons right">send</i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <br />

          {/* Mint Silverback to a Specific Address */}
          <div className="card">
            <div className="card-content">
              <span className="card-title">Mint Silverback to a Specific Address</span>
              <p>
                Deposit exactly 100 stablecoins to mint a Silverback NFT to a chosen recipient.
              </p>
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
              <button onClick={handleDepositTo} className="btn waves-effect waves-light">
                Deposit &amp; Mint to Recipient
                <i className="material-icons right">send</i>
              </button>
            </div>
          </div>

          <br />

          {/* Batch Mint from CSV */}
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

          <br />

          {/* Display NFTs */}
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
                          <button onClick={() => handleBurn(n.tokenId)} className="btn red lighten-1">
                            Burn &amp; Redeem
                          </button>
                          <button onClick={() => handleTransfer(n.tokenId)} className="btn blue lighten-1" style={{ marginLeft: "0.5rem" }}>
                            Transfer NFT
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="card-panel red lighten-4">
          <p>Please connect your wallet using the header.</p>
        </div>
      )}

      {/* Debug Log */}
      <div className="card-panel grey darken-3" style={{ marginTop: "2rem", color: "white" }}>
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
