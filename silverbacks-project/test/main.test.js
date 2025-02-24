const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Silverbacks Basic Tests", function() {
  let stableCoin, nft, vault;
  let owner, addr1, addr2;

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy stable coin
    const StableCoin = await ethers.getContractFactory("MyStableCoin");
    stableCoin = await StableCoin.deploy("MyStableCoin", "MSC");
    await stableCoin.deployed();

    // Deploy NFT
    const SilverbacksNFT = await ethers.getContractFactory("SilverbacksNFT");
    nft = await SilverbacksNFT.deploy("SilverbacksNFT", "SBX");
    await nft.deployed();

    // Deploy Vault
    const SilverbacksVault = await ethers.getContractFactory("SilverbacksVault");
    vault = await SilverbacksVault.deploy(stableCoin.address, nft.address);
    await vault.deployed();

    // Set the vault contract in the NFT
    await nft.setVaultContract(vault.address);

    // Mint some stablecoins to addr1 for testing
    await stableCoin.mint(addr1.address, ethers.utils.parseUnits("1000", 18));
  });

  it("Should deposit $102, get 1 NFT, and refund the remainder of 2", async () => {
    // Approve vault to spend 102 from addr1
    await stableCoin.connect(addr1).approve(vault.address, ethers.utils.parseUnits("102", 18));

    // Deposit with a generous gas limit
    await vault.connect(addr1).deposit(ethers.utils.parseUnits("102", 18), { gasLimit: 10000000 });

    // Expect user to have 1 NFT
    expect(await nft.balanceOf(addr1.address)).to.equal(1);

    // Check final stableCoin balance of addr1:
    // addr1 started with 1000; $102 deposited: $100 locked, $2 refunded => final balance should be 900
    const finalBal = await stableCoin.balanceOf(addr1.address);
    expect(finalBal).to.equal(ethers.utils.parseUnits("900", 18));

    // The NFT minted for a face value of 100
    const tokenId = 0;
    expect(await nft.faceValue(tokenId)).to.equal(100);
  });

  it("Should redeem an NFT and return stablecoins to the redeemer", async () => {
    // Approve vault and deposit $200 to get 2 NFTs for addr1
    await stableCoin.connect(addr1).approve(vault.address, ethers.utils.parseUnits("200", 18));
    await vault.connect(addr1).deposit(ethers.utils.parseUnits("200", 18), { gasLimit: 10000000 });
    expect(await nft.balanceOf(addr1.address)).to.equal(2);

    // Redeem tokenId=0 with an override gas limit
    await vault.connect(addr1).redeem(0, { gasLimit: 10000000 });

    // After deposit: addr1 spent 200 locked; had 800 left.
    // Redeeming tokenId 0 returns 100 stablecoins: final balance should be 900.
    const finalBal = await stableCoin.balanceOf(addr1.address);
    expect(finalBal).to.equal(ethers.utils.parseUnits("900", 18));
  });
});
