// silverbacks-contracts/scripts/deploy.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

/**
 * Helper function to deploy a contract.
 */
async function deployContract(contractFactory, contractName, ...args) {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying ${contractName} from address: ${deployer.address}`);

  let estimatedGas, gasPrice, estimatedCost;
  try {
    const deployTx = contractFactory.getDeployTransaction(...args);
    estimatedGas = await deployer.estimateGas(deployTx);
    gasPrice = await deployer.getGasPrice();
    estimatedCost = estimatedGas.mul(gasPrice);
    console.log(
      `Estimated cost for ${contractName} deployment: ${ethers.utils.formatEther(estimatedCost)} ETH`
    );
  } catch (err) {
    console.error("Error estimating gas: ", err.message);
  }

  try {
    const instance = await contractFactory.deploy(...args);
    await instance.deployed();
    console.log(`${contractName} deployed at: ${instance.address}`);
    return instance;
  } catch (err) {
    if (err.message.includes("Upfront cost exceeds account balance")) {
      const balance = await deployer.getBalance();
      console.error("Upfront cost exceeds account balance");
      console.error(`Deployer address: ${deployer.address}`);
      console.error(`Deployer balance: ${ethers.utils.formatEther(balance)} ETH`);
      if (estimatedCost) {
        console.error(`Estimated cost: ${ethers.utils.formatEther(estimatedCost)} ETH`);
      }
    }
    throw err;
  }
}

async function main() {
  // Log the deployer address before starting deployments.
  const [deployer] = await ethers.getSigners();
  console.log("Starting deployment with deployer address:", deployer.address);

  // 1) Deploy MyStableCoin
  const StableCoinFactory = await ethers.getContractFactory("MyStableCoin");
  const stableCoin = await deployContract(StableCoinFactory, "MyStableCoin", "MyStableCoin", "MSC");

  // 2) Deploy SilverbacksNFT
  const SilverbacksNFTFactory = await ethers.getContractFactory("SilverbacksNFT");
  const nft = await deployContract(SilverbacksNFTFactory, "SilverbacksNFT", "SilverbacksNFT", "SBX");

  // Set the base URI for NFT metadata.
  let tx = await nft.setBaseURI("https://rays-automobile-clearly.quicknode-ipfs.com/ipfs/");
  await tx.wait();
  console.log("Base URI set for SilverbacksNFT");

  // 3) Deploy SilverbacksVault
  const SilverbacksVaultFactory = await ethers.getContractFactory("SilverbacksVault");
  const vault = await deployContract(SilverbacksVaultFactory, "SilverbacksVault", stableCoin.address, nft.address);

  // Configure NFT so vault can mint/burn tokens.
  tx = await nft.setVaultContract(vault.address);
  await tx.wait();
  console.log("Vault contract set in SilverbacksNFT");

  // Optional: Mint some stablecoins for deployer testing.
  tx = await stableCoin.mint(deployer.address, ethers.utils.parseUnits("10000", 18));
  await tx.wait();
  console.log("Minted 10000 stablecoins to deployer.");

  // Retrieve some details just for logging:
  const stableCoinName = await stableCoin.name();
  const stableCoinSymbol = await stableCoin.symbol();
  const stableCoinDecimals = await stableCoin.decimals();
  const nftName = await nft.name();
  const nftSymbol = await nft.symbol();

  // Get current network details.
  const network = await ethers.provider.getNetwork();
  const chainIdHex = "0x" + network.chainId.toString(16);

  // Example chainDataMap with no spaces in chainName
  const chainDataMap = {
    11155111: {
      chainName: "ethereum-sepolia", // updated naming convention
      rpc: process.env.RPC_URL || "",
      explorer: "https://sepolia.etherscan.io"
    },
    59141: {
      chainName: "linea-sepolia",
      rpc: process.env.LINEA_RPC_URL || "",
      explorer: "https://sepolia.lineascan.build"
    },
    31337: {
      chainName: "hardhat",
      rpc: "http://127.0.0.1:8545",
      explorer: ""
    }
  };

  // Fallback if the chain ID isn't recognized:
  const extraChainData = chainDataMap[network.chainId] || {
    chainName: network.name,
    rpc: "",
    explorer: ""
  };

  // Write deployment addresses to chains.json
  const chainsFilePath = path.join(__dirname, "..", "chains.json");
  let chains = {};
  if (fs.existsSync(chainsFilePath)) {
    try {
      const data = fs.readFileSync(chainsFilePath, "utf8");
      chains = JSON.parse(data);
    } catch (err) {
      console.error("Error reading chains.json:", err);
    }
  }

  // If the chain already exists, only update the contracts object.
  if (chains[chainIdHex]) {
    chains[chainIdHex].contracts = {
      stableCoin: stableCoin.address,
      silverbacksNFT: nft.address,
      vault: vault.address
    };
  } else {
    chains[chainIdHex] = {
      chainId: network.chainId,
      chainName: extraChainData.chainName,
      rpc: extraChainData.rpc,
      explorer: extraChainData.explorer,
      contracts: {
        stableCoin: stableCoin.address,
        silverbacksNFT: nft.address,
        vault: vault.address
      }
    };
  }

  try {
    fs.writeFileSync(chainsFilePath, JSON.stringify(chains, null, 2));
    console.log("Updated chains.json with deployment addresses for chain", chainIdHex);
  } catch (err) {
    console.error("Error writing chains.json:", err);
  }

  console.log("Deployment complete.");
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Error in deployment:", err);
    process.exit(1);
  });
