require("@nomiclabs/hardhat-ethers");
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
  // Log deployer info
  const [deployer] = await ethers.getSigners();
  console.log("Starting deployment with deployer address:", deployer.address);

  // --- Deploy original Silverbacks contracts ---
  const StableCoinFactory = await ethers.getContractFactory("MyStableCoin");
  // Updated to pass initial supply (e.g. 10000 tokens with 18 decimals)
  const stableCoin = await deployContract(
    StableCoinFactory,
    "MyStableCoin",
    "MyStableCoin",
    "MSC",
    ethers.utils.parseUnits("10000", 18)
  );

  const SilverbacksNFTFactory = await ethers.getContractFactory("SilverbacksNFT");
  const nft = await deployContract(SilverbacksNFTFactory, "SilverbacksNFT", "SilverbacksNFT", "SBX");
  let tx = await nft.setBaseURI("https://rays-automobile-clearly.quicknode-ipfs.com/ipfs/");
  await tx.wait();
  console.log("Base URI set for SilverbacksNFT");

  const SilverbacksVaultFactory = await ethers.getContractFactory("SilverbacksVault");
  const vault = await deployContract(SilverbacksVaultFactory, "SilverbacksVault", stableCoin.address, nft.address);
  tx = await nft.setVaultContract(vault.address);
  await tx.wait();
  console.log("Vault contract set in SilverbacksNFT");

  tx = await stableCoin.mint(deployer.address, ethers.utils.parseUnits("10000", 18));
  await tx.wait();
  console.log("Minted 10000 stablecoins to deployer.");

  // --- Deploy new MultiToken contracts ---
  // Deploy three ERC20 tokens: WBTC, WETH, WLTC (using MyERC20Token)
  const MyERC20TokenFactory = await ethers.getContractFactory("MyERC20Token");
  const initialSupply = ethers.utils.parseUnits("1000", 18);
  const wbtc = await deployContract(MyERC20TokenFactory, "WBTC", "WBTC", "WBTC", initialSupply);
  const weth = await deployContract(MyERC20TokenFactory, "WETH", "WETH", "WETH", initialSupply);
  const wltc = await deployContract(MyERC20TokenFactory, "WLTC", "WLTC", "WLTC", initialSupply);

  // Deploy the MultiTokenNFT contract.
  const MultiTokenNFTFactory = await ethers.getContractFactory("MultiTokenNFT");
  const multiNFT = await deployContract(MultiTokenNFTFactory, "MultiTokenNFT", "MultiTokenNFT", "MTNFT");
  tx = await multiNFT.setBaseURI("https://your-multitoken-nft-metadata.example/ipfs/");
  await tx.wait();
  console.log("Base URI set for MultiTokenNFT");

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

  // --- Save deployment addresses ---
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
  chains[chainIdHex] = {
    chainId: network.chainId,
    chainName: network.name,
    rpc: "",
    explorer: "",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    contracts: {
      stableCoin: stableCoin.address,
      silverbacksNFT: nft.address,
      vault: vault.address,
      wbtc: wbtc.address,
      weth: weth.address,
      wltc: wltc.address,
      multiTokenNFT: multiNFT.address,
      multiTokenVault: multiVault.address
    }
  };
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
