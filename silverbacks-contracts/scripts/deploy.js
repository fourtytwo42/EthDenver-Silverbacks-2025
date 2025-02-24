const { ethers } = require("hardhat");

async function main() {
  // 1) Deploy MyStableCoin
  const StableCoin = await ethers.getContractFactory("MyStableCoin");
  const stableCoin = await StableCoin.deploy("MyStableCoin", "MSC");
  await stableCoin.deployed();
  console.log("StableCoin deployed at:", stableCoin.address);

  // 2) Deploy SilverbacksNFT
  const SilverbacksNFT = await ethers.getContractFactory("SilverbacksNFT");
  const nft = await SilverbacksNFT.deploy("SilverbacksNFT", "SBX");
  await nft.deployed();
  console.log("SilverbacksNFT deployed at:", nft.address);

  // Set the base URI for NFT metadata to your provided IPFS URL.
  // Make sure your metadata JSON files (0.json, 1.json, etc.) are uploaded in this folder.
  const baseURI = "https://rays-automobile-clearly.quicknode-ipfs.com/ipfs/";
  let tx = await nft.setBaseURI(baseURI);
  await tx.wait();
  console.log("Base URI set for SilverbacksNFT:", baseURI);

  // 3) Deploy SilverbacksVault
  const SilverbacksVault = await ethers.getContractFactory("SilverbacksVault");
  const vault = await SilverbacksVault.deploy(stableCoin.address, nft.address);
  await vault.deployed();
  console.log("SilverbacksVault deployed at:", vault.address);

  // Configure NFT so vault can mint/burn tokens.
  tx = await nft.setVaultContract(vault.address);
  await tx.wait();
  console.log("Vault contract set in SilverbacksNFT");

  // Optional: Mint some stablecoins for deployer testing.
  const [deployer] = await ethers.getSigners();
  tx = await stableCoin.mint(deployer.address, ethers.utils.parseUnits("10000", 18));
  await tx.wait();
  console.log("Minted 10000 stablecoins to deployer.");

  console.log("Deployment complete.");
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Error in deployment:", err);
    process.exit(1);
  });
