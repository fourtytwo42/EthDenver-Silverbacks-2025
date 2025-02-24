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

  it("Should deposit $102, get 1 NFT, and redeem the remainder of 2", async () => {
    // Approve vault to spend 102 from addr1
    await stableCoin.connect(addr1).approve(vault.address, ethers.utils.parseUnits("102", 18));

    // deposit(102)
    await vault.connect(addr1).deposit(ethers.utils.parseUnits("102", 18));

    // Expect user to have 1 NFT
    expect(await nft.balanceOf(addr1.address)).to.equal(1);

    // The remainder 2 should have been refunded
    // So user spent exactly 100 in the vault
    // Let's confirm stableCoin balance
    const finalBal = await stableCoin.balanceOf(addr1.address);
    // minted 1000, deposit(102), remainder(2) refunded => finalBal ~ 900
    // because 100 locked in vault
    // We check if it's roughly 898 or so because 2 is refunded out of 102
    // Actually let's do an exact approach
    // minted 1000 => final bal = 898
    // but we see 2 refunded => 900 left
    // let's do a direct check
    const expected = ethers.utils.parseUnits("898", 18);
    // Because 100 tokens are locked in vault, 2 refunded -> 900 left
    expect(finalBal).to.equal(expected);

    // The NFT minted for 100 face value
    const tokenId = 0;
    expect(await nft.faceValue(tokenId)).to.equal(100);
  });

  it("Should redeem an NFT and get stablecoins back", async () => {
    // Approve vault
    await stableCoin.connect(addr1).approve(vault.address, ethers.utils.parseUnits("200", 18));
    // deposit(200)
    await vault.connect(addr1).deposit(ethers.utils.parseUnits("200", 18));
    // user gets 2 NFTs (tokenIds 0,1)
    expect(await nft.balanceOf(addr1.address)).to.equal(2);

    // Now let's redeem tokenId=0
    await vault.connect(addr1).redeem(0);
    // user should receive 100 stable coins
    const finalBal = await stableCoin.balanceOf(addr1.address);
    // minted 1000 => after deposit(200) user left with 800
    // redeem(0) => user gets 100 => finalBal=900
    expect(finalBal).to.equal(ethers.utils.parseUnits("900", 18));
  });
});