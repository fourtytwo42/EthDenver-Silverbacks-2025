const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("Silverbacks Basic Tests", function() {
  let stableCoin, nft, vault;
  let owner, addr1, addr2;

  beforeEach(async () => {
    // Reset the Hardhat network to ensure a fresh state for every test run.
    await network.provider.send("hardhat_reset", []);

    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy the StableCoin contract.
    const StableCoin = await ethers.getContractFactory("MyStableCoin");
    stableCoin = await StableCoin.deploy("MyStableCoin", "MSC");
    await stableCoin.deployed();

    // Deploy the SilverbacksNFT contract.
    const SilverbacksNFT = await ethers.getContractFactory("SilverbacksNFT");
    nft = await SilverbacksNFT.deploy("SilverbacksNFT", "SBX");
    await nft.deployed();

    // Deploy the SilverbacksVault contract.
    const SilverbacksVault = await ethers.getContractFactory("SilverbacksVault");
    vault = await SilverbacksVault.deploy(stableCoin.address, nft.address);
    await vault.deployed();

    // Set the vault contract address in the NFT contract.
    await nft.setVaultContract(vault.address);

    // Mint some stablecoins to addr1 for testing.
    await stableCoin.mint(addr1.address, ethers.utils.parseUnits("1000", 18));
  });

  it("Should deposit $102, mint 1 NFT, and refund the remainder of 2", async () => {
    // Approve the vault to spend 102 stablecoins from addr1.
    await stableCoin
      .connect(addr1)
      .approve(vault.address, ethers.utils.parseUnits("102", 18));

    // Call deposit with 102 stablecoins; expect 1 NFT minted and 2 refunded.
    await vault
      .connect(addr1)
      .deposit(ethers.utils.parseUnits("102", 18), { gasLimit: 10000000 });

    // Compare NFT balance by converting BigNumber to string.
    expect((await nft.balanceOf(addr1.address)).toString()).to.equal("1");

    // Check addr1's stablecoin balance:
    // Starting balance: 1000, deposit used: 102, but 2 refunded -> net locked = 100,
    // so final balance should be 1000 - 100 = 900.
    const finalBal = await stableCoin.balanceOf(addr1.address);
    expect(finalBal.toString()).to.equal(
      ethers.utils.parseUnits("900", 18).toString()
    );

    // Verify that the minted NFT (tokenId = 0) has a face value of 100.
    expect((await nft.faceValue(0)).toString()).to.equal("100");
  });

  it("Should redeem an NFT and return stablecoins to the redeemer", async () => {
    // Approve the vault to spend 200 stablecoins and deposit $200 to mint 2 NFTs.
    await stableCoin
      .connect(addr1)
      .approve(vault.address, ethers.utils.parseUnits("200", 18));
    await vault
      .connect(addr1)
      .deposit(ethers.utils.parseUnits("200", 18), { gasLimit: 10000000 });

    // Compare NFT balance by converting BigNumber to string.
    expect((await nft.balanceOf(addr1.address)).toString()).to.equal("2");

    // Redeem the NFT with tokenId 0.
    await vault.connect(addr1).redeem(0, { gasLimit: 10000000 });

    // After depositing 200 stablecoins, addr1's balance would drop to 800.
    // Redeeming tokenId 0 returns 100 stablecoins, so final balance should be 900.
    const finalBal = await stableCoin.balanceOf(addr1.address);
    expect(finalBal.toString()).to.equal(
      ethers.utils.parseUnits("900", 18).toString()
    );
  });
});
