require("@nomiclabs/hardhat-ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const DEPLOY_SET = process.env.DEPLOY_SET;
if (!DEPLOY_SET) {
  throw new Error("Please set the DEPLOY_SET environment variable to either 'silverbacks' or 'multitoken'");
}

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
  const [deployer] = await ethers.getSigners();
  console.log("Starting deployment with deployer address:", deployer.address);

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
      // Deploy MyStableCoin if no address provided.
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
    let tx = await nft.setBaseURI("https://rays-automobile-clearly.quicknode-ipfs.com/ipfs/");
    await tx.wait();
    console.log("Base URI set for SilverbacksNFT");
    deployedContracts.silverbacksNFT = nft.address;

    // Deploy SilverbacksVault.
    const SilverbacksVaultFactory = await ethers.getContractFactory("SilverbacksVault");
    const vault = await deployContract(SilverbacksVaultFactory, "SilverbacksVault", stableCoinAddress, nft.address);
    tx = await nft.setVaultContract(vault.address);
    await tx.wait();
    console.log("Vault contract set in SilverbacksNFT");
    deployedContracts.vault = vault.address;

    // Optional: mint additional stablecoins if deployed here.
    if (!process.env.EXISTING_STABLECOIN_ADDRESS || process.env.EXISTING_STABLECOIN_ADDRESS.trim() === "") {
      tx = await (await ethers.getContractFactory("MyStableCoin")).attach(stableCoinAddress).mint(deployer.address, ethers.utils.parseUnits("10000", 18));
      await tx.wait();
      console.log("Minted 10000 stablecoins to deployer.");
    }
  } else if (DEPLOY_SET === "multitoken") {
    console.log("Deploying King Louis (MultiToken) contracts...");

    // --- Deploy MultiToken Contracts ---
    // Deploy three ERC20 tokens: WBTC, WETH, WLTC (using MyERC20Token)
    const MyERC20TokenFactory = await ethers.getContractFactory("MyERC20Token");
    const initialSupply = ethers.utils.parseUnits("1000", 18);
    const wbtc = await deployContract(MyERC20TokenFactory, "WBTC", "WBTC", "WBTC", initialSupply);
    const weth = await deployContract(MyERC20TokenFactory, "WETH", "WETH", "WETH", initialSupply);
    const wltc = await deployContract(MyERC20TokenFactory, "WLTC", "WLTC", "WLTC", initialSupply);
    deployedContracts.wbtc = wbtc.address;
    deployedContracts.weth = weth.address;
    deployedContracts.wltc = wltc.address;

    // Deploy the MultiTokenNFT contract.
    const MultiTokenNFTFactory = await ethers.getContractFactory("MultiTokenNFT");
    const multiNFT = await deployContract(MultiTokenNFTFactory, "MultiTokenNFT", "MultiTokenNFT", "MTNFT");
    let tx = await multiNFT.setBaseURI("https://your-multitoken-nft-metadata.example/ipfs/");
    await tx.wait();
    console.log("Base URI set for MultiTokenNFT");
    deployedContracts.multiTokenNFT = multiNFT.address;

    // Deploy the MultiTokenVault contract.
    const MultiTokenVaultFactory = await ethers.getContractFactory("MultiTokenVault");
    const multiVault = await deployContract(
      MultiTokenVaultFactory,
      "MultiTokenVault",
      wbtc.address,
      weth.address,
      wltc.address,
      multiNFT.address
    );
    tx = await multiNFT.setVaultContract(multiVault.address);
    await tx.wait();
    console.log("Vault contract set in MultiTokenNFT");
    deployedContracts.multiTokenVault = multiVault.address;
  } else {
    throw new Error("Invalid DEPLOY_SET value. Must be either 'silverbacks' or 'multitoken'");
  }

  // --- Save deployment addresses to chains.json ---
  const network = await ethers.provider.getNetwork();
  const chainIdHex = "0x" + network.chainId.toString(16);
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
  // For Sepolia (chainId 0xaa36a7)
  if (chainIdHex === "0xaa36a7") {
    networkConfig = {
      chainId: network.chainId,
      chainName: "ethereum-sepolia",
      rpc: "https://rpc.sepolia.org",
      explorer: "https://sepolia.etherscan.io",
      nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }
  // For Linea (chainId 0xe705)
  else if (chainIdHex === "0xe705") {
    networkConfig = {
      chainId: network.chainId,
      chainName: "linea-sepolia",
      rpc: "https://rpc.sepolia.linea.build",
      explorer: "https://sepolia.lineascan.build",
      nativeCurrency: { name: "LineaETH", symbol: "LineaETH", decimals: 18 },
      contracts: {}
    };
  }
  // For Flow Testnet (chainId 0x221)
  else if (chainIdHex === "0x221") {
    networkConfig = {
      chainId: network.chainId,
      chainName: "flow-testnet",
      rpc: "https://testnet.evm.nodes.onflow.org",
      explorer: "https://evm-testnet.flowscan.io",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }
  // For Unicorn Ultra Nebulas Testnet (U2U, chainId 2484 -> hex "0x9b4")
  else if (chainIdHex === "0x9b4") {
    networkConfig = {
      chainId: network.chainId,
      chainName: "Unicorn Ultra Nebulas Testnet",
      rpc: process.env.U2U_RPC_URL,
      explorer: "", // Add explorer URL here if available
      nativeCurrency: { name: "U2U", symbol: "U2U", decimals: 18 },
      contracts: {}
    };
  }
  // For Story Aeneid (chainId 1315 -> hex "0x523")
  else if (chainIdHex === "0x523") {
    networkConfig = {
      chainId: network.chainId,
      chainName: "Story Aeneid",
      rpc: process.env.STORYAENEID_RPC_URL,
      explorer: "", // Add block explorer URL here if available
      nativeCurrency: { name: "IP", symbol: "IP", decimals: 18 },
      contracts: {}
    };
  }
  else {
    // Fallback: use the network name and empty rpc/explorer fields.
    networkConfig = {
      chainId: network.chainId,
      chainName: network.name,
      rpc: "",
      explorer: "",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      contracts: {}
    };
  }

  // Merge any already existing contract data on this chain.
  if (chains[chainIdHex] && chains[chainIdHex].contracts) {
    networkConfig.contracts = chains[chainIdHex].contracts;
  }

  // Now add our newly deployed contracts.
  if (DEPLOY_SET === "silverbacks") {
    networkConfig.contracts.silverbacks = {
      stableCoin: deployedContracts.stableCoin,
      silverbacksNFT: deployedContracts.silverbacksNFT,
      vault: deployedContracts.vault
    };
    console.log("Updated chains.json with Silverbacks deployment addresses for chain", chainIdHex);
  } else if (DEPLOY_SET === "multitoken") {
    networkConfig.contracts.kingLouis = {
      wbtc: deployedContracts.wbtc,
      weth: deployedContracts.weth,
      wltc: deployedContracts.wltc,
      multiTokenNFT: deployedContracts.multiTokenNFT,
      multiTokenVault: deployedContracts.multiTokenVault
    };
    console.log("Updated chains.json with King Louis (MultiToken) deployment addresses for chain", chainIdHex);
  }

  // Save the updated configuration under the chainId key.
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
