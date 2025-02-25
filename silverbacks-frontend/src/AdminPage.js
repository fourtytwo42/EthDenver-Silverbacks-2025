import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { create } from "ipfs-http-client";

// Replace with your deployed contract addresses:
const stableCoinAddress = "0xfED1D0836004e47a30C93aa5E3eD7735B977a2eb";
const silverbacksNftAddress = "0xEb641123243b897201B7E1fB2052256B6E9e1f5a";
const vaultAddress = "0x2A314860Cc789D30E384369769e2C85b67939689";

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

// Create an IPFS client using your node’s API endpoint.
const ipfsClient = create({ url: "https://silverbacksipfs.online/api/v0" });

// Maximum file size allowed (5 MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB in bytes

const AdminPage = ({ currentAccount }) => {
  // States for deposit/mint functionality
  const [depositAmount, setDepositAmount] = useState("100");
  const [depositRecipient, setDepositRecipient] = useState("");
  const [frontImageFile, setFrontImageFile] = useState(null);
  const [backImageFile, setBackImageFile] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [nfts, setNfts] = useState([]);
  const [logMessages, setLogMessages] = useState([]);

  const log = (msg) => {
    console.log(msg);
    setLogMessages((prev) => [...prev, msg]);
  };

  // Function to load admin data (including NFT data)
  const loadData = async () => {
    if (!currentAccount || !window.ethereum) return;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const stableCoinContract = new ethers.Contract(stableCoinAddress, stableCoinABI, provider);
    const nftContract = new ethers.Contract(silverbacksNftAddress, nftABI, provider);
    try {
      const bal = await stableCoinContract.balanceOf(currentAccount);
      log("StableCoin balance (raw) = " + bal.toString());
      // (You can use this balance for admin statistics as needed)
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
    if (currentAccount) {
      loadData();
    }
  }, [currentAccount]);

  // HANDLERS

  // Deposit (mint to self)
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
      const stableCoinContract = new ethers.Contract(stableCoinAddress, stableCoinABI, signer);
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      const depositWei = ethers.utils.parseEther(rawAmount);
      let tx = await stableCoinContract.approve(vaultAddress, depositWei);
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

  // Deposit to a specific address
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
      const stableCoinContract = new ethers.Contract(stableCoinAddress, stableCoinABI, signer);
      let approveTx = await stableCoinContract.approve(vaultAddress, depositWei);
      log("Approving vault to spend 100 tokens...");
      await approveTx.wait();
      log("Approval confirmed.");
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      let tx = await vaultContract.depositTo(depositRecipient, depositWei, metaURI);
      log("Depositing stablecoins and minting NFT to " + depositRecipient + "...");
      await tx.wait();
      log("DepositTo transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in depositTo: " + err.message);
    }
  };

  // CSV Batch deposit
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
      const stableCoinContract = new ethers.Contract(stableCoinAddress, stableCoinABI, signer);
      let tx = await stableCoinContract.approve(vaultAddress, totalDeposit);
      log("Approving vault for batch deposit of " + (recipients.length * 100) + " tokens...");
      await tx.wait();
      log("Approval confirmed.");
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      tx = await vaultContract.batchDeposit(recipients, metadataURIs);
      log("Batch deposit transaction submitted...");
      await tx.wait();
      log("Batch deposit transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error in CSV deposit: " + err.message);
    }
  };

  // Burn NFT (redeem)
  const handleBurn = async (tokenId) => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const vaultContract = new ethers.Contract(vaultAddress, vaultABI, signer);
      log("Burning NFT tokenId: " + tokenId + " to redeem stablecoins...");
      const tx = await vaultContract.redeem(tokenId);
      await tx.wait();
      log("Redeem transaction confirmed!");
      loadData();
    } catch (err) {
      log("Error burning NFT: " + err.message);
    }
  };

  // Transfer NFT
  const handleTransfer = async (tokenId) => {
    const recipient = prompt("Enter recipient address:");
    if (!recipient || !ethers.utils.isAddress(recipient)) {
      alert("Invalid Ethereum address.");
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
      loadData();
    } catch (err) {
      log("Error transferring NFT: " + err.message);
    }
  };

  // File input handlers
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

  const handleCSVFileChange = (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      setCsvFile(file);
      log("CSV file selected: " + file.name);
    }
  };

  // Listen for account or chain changes (optional if handled in Header)
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          // In admin page, we expect currentAccount to be managed in the parent
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
    <div style={pageContainerStyle}>
      <h1>Admin Dashboard</h1>
      {currentAccount ? (
        <>
          <p>
            Wallet Connected: <strong>{currentAccount}</strong>
          </p>
          <div style={sectionStyle}>
            <h2>Mint Silverbacks (to Self)</h2>
            <p>
              Deposit must be a multiple of 100. You’ll receive 1 NFT per $100 deposited.
            </p>
            <div style={inputGroupStyle}>
              <input type="file" accept="image/*" onChange={handleFrontImageChange} />
              <input type="file" accept="image/*" onChange={handleBackImageChange} />
            </div>
            <div style={inputGroupStyle}>
              <input
                type="number"
                step="100"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={inputStyle}
              />
              <button onClick={handleDeposit} style={buttonStyle}>
                Deposit & Mint
              </button>
            </div>
          </div>
          <hr style={dividerStyle} />
          <div style={sectionStyle}>
            <h2>Mint Silverback to a Specific Address</h2>
            <p>
              Deposit exactly 100 stablecoins to mint a Silverback NFT to a chosen recipient.
            </p>
            <div style={inputGroupStyle}>
              <input
                type="text"
                placeholder="Recipient address"
                value={depositRecipient}
                onChange={(e) => setDepositRecipient(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              />
              <input type="file" accept="image/*" onChange={handleFrontImageChange} />
              <input type="file" accept="image/*" onChange={handleBackImageChange} />
            </div>
            <button onClick={handleDepositTo} style={buttonStyle}>
              Deposit & Mint to Recipient
            </button>
          </div>
          <hr style={dividerStyle} />
          <div style={sectionStyle}>
            <h2>Batch Mint from CSV</h2>
            <p>
              Upload a CSV file with 3 columns: Recipient address, Front image URL, Back image URL.
              Each row deposits $100 and mints an NFT.
            </p>
            <input type="file" accept=".csv" onChange={handleCSVFileChange} style={inputStyle} />
            <button onClick={handleCSVDeposit} style={buttonStyle}>
              Process CSV Batch Deposit
            </button>
          </div>
          <hr style={dividerStyle} />
          <div style={sectionStyle}>
            <h2>Your Silverbacks NFTs</h2>
            {nfts.length === 0 ? (
              <p>No Silverbacks NFTs found.</p>
            ) : (
              <div style={nftGridStyle}>
                {nfts.map((n) => (
                  <div key={n.tokenId} style={nftCardStyle}>
                    <p>
                      <strong>Token ID:</strong> {n.tokenId}
                    </p>
                    <p>
                      <strong>Face Value:</strong> {n.faceValue} USD
                    </p>
                    {n.image ? (
                      <div>
                        <img
                          src={n.image.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                          alt="NFT Front"
                          style={imageStyle}
                        />
                        {n.imageBack && (
                          <img
                            src={n.imageBack.replace("ipfs://", "https://silverbacksipfs.online/ipfs/")}
                            alt="NFT Back"
                            style={{ ...imageStyle, marginTop: "0.5rem" }}
                          />
                        )}
                      </div>
                    ) : (
                      <p>No images available.</p>
                    )}
                    <button onClick={() => handleBurn(n.tokenId)} style={buttonStyle}>
                      Burn & Redeem
                    </button>
                    <button onClick={() => handleTransfer(n.tokenId)} style={{ ...buttonStyle, marginTop: "0.5rem" }}>
                      Transfer NFT
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <p>Please connect your wallet using the header.</p>
      )}
      <div style={debugLogStyle}>
        <h3>Debug Log</h3>
        {logMessages.map((msg, idx) => (
          <p key={idx} style={{ fontFamily: "monospace", margin: 0 }}>{msg}</p>
        ))}
      </div>
    </div>
  );
};

const pageContainerStyle = {
  padding: "2rem",
  backgroundColor: "#fff",
  borderRadius: "8px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  margin: "2rem auto",
  maxWidth: "900px"
};

const sectionStyle = {
  marginBottom: "1.5rem"
};

const inputGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  marginBottom: "1rem"
};

const inputStyle = {
  padding: "0.5rem",
  fontSize: "1rem"
};

const buttonStyle = {
  padding: "0.5rem 1rem",
  backgroundColor: "#4CAF50",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "1rem"
};

const dividerStyle = {
  margin: "1.5rem 0",
  border: "none",
  borderTop: "1px solid #ddd"
};

const nftGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "1rem",
  marginTop: "1rem"
};

const nftCardStyle = {
  padding: "1rem",
  border: "1px solid #ddd",
  borderRadius: "8px",
  backgroundColor: "#f9f9f9",
  textAlign: "center"
};

const imageStyle = {
  width: "100%",
  borderRadius: "4px"
};

const debugLogStyle = {
  marginTop: "2rem",
  backgroundColor: "#333",
  color: "#fff",
  padding: "1rem",
  borderRadius: "4px",
  maxHeight: "200px",
  overflowY: "auto"
};

export default AdminPage;
