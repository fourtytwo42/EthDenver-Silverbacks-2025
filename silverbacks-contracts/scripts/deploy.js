require("@nomiclabs/hardhat-ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const DEPLOY_SET = process.env.DEPLOY_SET;
if (!DEPLOY_SET) {
  throw new Error("Please set the DEPLOY_SET environment variable to either 'silverbacks' or 'multitoken'");
}

/**
 * Global variable for nonce management.
 */
let currentNonce;

/**
 * Helper function to send a transaction with manual nonce management.
 */
async function sendTransaction(txPromise) {
  const tx = await txPromise;
  await tx.wait();
  currentNonce++;
  return tx;
}

/**
 * Helper function to deploy a contract using our manual nonce.
 */
async function deployContract(contractFactory, contractName, ...args) {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying ${contractName} from address: ${deployer.address}`);
  const overrides = { nonce: currentNonce };
  
  try {
    const deployTx = contractFactory.getDeployTransaction(...args, overrides);
    const estimatedGas = await deployer.estimateGas(deployTx);
    const gasPrice = await deployer.getGasPrice();
    const estimatedCost = estimatedGas.mul(gasPrice);
    console.log(
      `Estimated cost for ${contractName} deployment: ${ethers.utils.formatEther(estimatedCost)} ETH`
    );
  } catch (err) {
    console.error("Error estimating gas: ", err.message);
  }
  
  try {
    const instance = await contractFactory.deploy(...args, overrides);
    await instance.deployed();
    console.log(`${contractName} deployed at: ${instance.address}`);
    currentNonce++; // update nonce
    return instance;
  } catch (err) {
    if (err.message.includes("Upfront cost exceeds account balance")) {
      const balance = await deployer.getBalance();
      console.error("Upfront cost exceeds account balance");
      console.error(`Deployer address: ${deployer.address}`);
      console.error(`Deployer balance: ${ethers.utils.formatEther(balance)} ETH`);
    }
    throw err;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Starting deployment with deployer address:", deployer.address);
  
  // Initialize global nonce.
  currentNonce = await deployer.getTransactionCount();
  console.log("Starting nonce:", currentNonce);

  // Object to collect deployed contract addresses
  const deployedContracts = {};

  if (DEPLOY_SET === "silverbacks") {
    console.log("Deploying Silverbacks contracts...");
    
    // --- Determine StableCoin ---
    let stableCoinAddress;
    if (process.env.EXISTING_STABLECOIN_ADDRESS && process.env.EXISTING_STABLECOIN_ADDRESS.trim() !== "") {
      stableCoinAddress = process.env.EXISTING_STABLECOIN_ADDRESS.trim();
      console.log("Using existing StableCoin at address:", stableCoinAddress);
      deployedContracts.stableCoin = stableCoinAddress;
    } else {
      const StableCoinFactory = await ethers.getContractFactory("MyStableCoin");
      const stableCoin = await deployContract(
        StableCoinFactory,
        "MyStableCoin",
        "MyStableCoin",
        "MSC",
        ethers.utils.parseUnits("10000", 18)
      );
      stableCoinAddress = stableCoin.address;
      deployedContracts.stableCoin = stableCoinAddress;
    }
    
    // Deploy SilverbacksNFT.
    const SilverbacksNFTFactory = await ethers.getContractFactory("SilverbacksNFT");
    const nft = await deployContract(SilverbacksNFTFactory, "SilverbacksNFT", "SilverbacksNFT", "SBX");
    let tx = await sendTransaction(nft.setBaseURI("https://rays-automobile-clearly.quicknode-ipfs.com/ipfs/"));
    console.log("Base URI set for SilverbacksNFT");
    deployedContracts.silverbacksNFT = nft.address;
    
    // Deploy SilverbacksVault.
    const SilverbacksVaultFactory = await ethers.getContractFactory("SilverbacksVault");
    const vault = await deployContract(SilverbacksVaultFactory, "SilverbacksVault", stableCoinAddress, nft.address);
    tx = await sendTransaction(nft.setVaultContract(vault.address));
    console.log("Vault contract set in SilverbacksNFT");
    deployedContracts.vault = vault.address;
    
    if (!process.env.EXISTING_STABLECOIN_ADDRESS || process.env.EXISTING_STABLECOIN_ADDRESS.trim() === "") {
      const StableCoinFactory = await ethers.getContractFactory("MyStableCoin");
      tx = await sendTransaction(StableCoinFactory.attach(stableCoinAddress).mint(deployer.address, ethers.utils.parseUnits("10000", 18)));
      console.log("Minted 10000 stablecoins to deployer.");
    }
  } else if (DEPLOY_SET === "multitoken") {
    console.log("Deploying King Louis (MultiToken) contracts...");
    
    const MyERC20TokenFactory = await ethers.getContractFactory("MyERC20Token");
    const initialSupply = ethers.utils.parseUnits("1000", 18);
    const wbtc = await deployContract(MyERC20TokenFactory, "WBTC", "WBTC", "WBTC", initialSupply);
    const weth = await deployContract(MyERC20TokenFactory, "WETH", "WETH", "WETH", initialSupply);
    const wltc = await deployContract(MyERC20TokenFactory, "WLTC", "WLTC", "WLTC", initialSupply);
    deployedContracts.wbtc = wbtc.address;
    deployedContracts.weth = weth.address;
    deployedContracts.wltc = wltc.address;
    
    const MultiTokenNFTFactory = await ethers.getContractFactory("MultiTokenNFT");
    const multiNFT = await deployContract(MultiTokenNFTFactory, "MultiTokenNFT", "MultiTokenNFT", "MTNFT");
    let tx = await sendTransaction(multiNFT.setBaseURI("https://your-multitoken-nft-metadata.example/ipfs/"));
    console.log("Base URI set for MultiTokenNFT");
    deployedContracts.multiTokenNFT = multiNFT.address;
    
    const MultiTokenVaultFactory = await ethers.getContractFactory("MultiTokenVault");
    const multiVault = await deployContract(
      MultiTokenVaultFactory,
      "MultiTokenVault",
      wbtc.address,
      weth.address,
      wltc.address,
      multiNFT.address
    );
    tx = await sendTransaction(multiNFT.setVaultContract(multiVault.address));
    console.log("Vault contract set in MultiTokenNFT");
    deployedContracts.multiTokenVault = multiVault.address;
  } else {
    throw new Error("Invalid DEPLOY_SET value. Must be either 'silverbacks' or 'multitoken'");
  }
  
  // --- Save deployment addresses to chains.json ---
  const networkData = await ethers.provider.getNetwork();
  const chainIdHex = "0x" + networkData.chainId.toString(16);
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
  
  // Build a network configuration object based on known networks.
  let networkConfig = {};
  // Ethereum Sepolia (chainId 0xaa36a7)
  if (chainIdHex === "0xaa36a7") {
    networkConfig = {
      chainId: networkData.chainId,
      chainName: "ethereum-sepolia",
      rpc: "https://rpc.sepolia.org",
      explorer: "https://sepolia.etherscan.io",
      nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }
  // Linea Sepolia (chainId 0xe705)
  else if (chainIdHex === "0xe705") {
    networkConfig = {
      chainId: networkData.chainId,
      chainName: "linea-sepolia",
      rpc: "https://rpc.sepolia.linea.build",
      explorer: "https://sepolia.lineascan.build",
      nativeCurrency: { name: "LineaETH", symbol: "LineaETH", decimals: 18 },
      contracts: {}
    };
  }
  // Flow Testnet (chainId 545 → hex "0x221")
  else if (chainIdHex === "0x221") {
    networkConfig = {
      chainId: networkData.chainId,
      chainName: "flow-testnet",
      rpc: "https://testnet.evm.nodes.onflow.org",
      explorer: "https://evm-testnet.flowscan.io",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }
  // Unicorn Ultra Nebulas Testnet (U2U, chainId 2484 → hex "0x9b4")
  else if (chainIdHex === "0x9b4") {
    networkConfig = {
      chainId: networkData.chainId,
      chainName: "u2u-testnet",
      rpc: process.env.U2U_RPC_URL,
      explorer: "", // Set explorer URL if available
      nativeCurrency: { name: "U2U", symbol: "U2U", decimals: 18 },
      contracts: {}
    };
  }
  // Unichain Sepolia (chainId 1301 → hex "0x515")
  else if (chainIdHex === "0x515") {
    networkConfig = {
      chainId: networkData.chainId,
      chainName: "Unichain Sepolia",
      rpc: process.env.UNICHAIN_SEPOLIA_RPC_URL,
      explorer: "https://sepolia.uniscan.xyz",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }
  // Zircuit Testnet (chainId 48899 → hex "0xbf03")
  else if (chainIdHex === "0xbf03") {
    networkConfig = {
      chainId: networkData.chainId,
      chainName: "Zircuit Testnet",
      rpc: process.env.ZIRCUIT_TESTNET_RPC_URL,
      explorer: "https://explorer.testnet.zircuit.com",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }
  // zkSync Sepolia (chainId 300 → hex "0x12c")
  else if (chainIdHex === "0x12c") {
    networkConfig = {
      chainId: networkData.chainId,
      chainName: "zkSync Sepolia",
      rpc: process.env.ZKSYNC_SEPOLIA_RPC_URL,
      explorer: "https://sepolia-era.zksync.network",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }
  else {
    // Fallback configuration.
    networkConfig = {
      chainId: networkData.chainId,
      chainName: networkData.name,
      rpc: "",
      explorer: "",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }
  
  // Merge any existing contracts for this chain.
  if (chains[chainIdHex] && chains[chainIdHex].contracts) {
    networkConfig.contracts = { ...chains[chainIdHex].contracts };
  }
  // Merge all newly deployed contracts into the contracts object.
  networkConfig.contracts = { ...networkConfig.contracts, ...deployedContracts };

  chains[chainIdHex] = networkConfig;
  try {
    fs.writeFileSync(chainsFilePath, JSON.stringify(chains, null, 2));
    console.log("chains.json updated successfully.");
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
