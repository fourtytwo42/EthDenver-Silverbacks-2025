const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Original Silverbacks Contracts", function () {
  let stableCoin, nft, vault;
  let owner, addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy MyStableCoin with an initial supply.
    const StableCoin = await ethers.getContractFactory("MyStableCoin");
    stableCoin = await StableCoin.deploy(
      "MyStableCoin",
      "MSC",
      ethers.utils.parseUnits("10000", 18)
    );
    await stableCoin.deployed();

    // Deploy SilverbacksNFT.
    const SilverbacksNFT = await ethers.getContractFactory("SilverbacksNFT");
    nft = await SilverbacksNFT.deploy("SilverbacksNFT", "SBX");
    await nft.deployed();
    let tx = await nft.setBaseURI("https://example.com/metadata/");
    await tx.wait();

    // Deploy SilverbacksVault.
    const SilverbacksVault = await ethers.getContractFactory("SilverbacksVault");
    vault = await SilverbacksVault.deploy(stableCoin.address, nft.address);
    await vault.deployed();
    tx = await nft.setVaultContract(vault.address);
    await tx.wait();

    // Mint some stable coins to addr1 for testing.
    await stableCoin.transfer(addr1.address, ethers.utils.parseUnits("1000", 18));
  });

  it("should deposit stableCoin and mint an NFT then redeem to return tokens", async function () {
    // Approve the vault to spend 102 stablecoins.
    await stableCoin.connect(addr1).approve(vault.address, ethers.utils.parseUnits("102", 18));

    // Deposit: 102 tokens means 1 NFT minted and a refund of 2 tokens.
    const depositTx = await vault
      .connect(addr1)
      .deposit(ethers.utils.parseUnits("102", 18), "ipfs://test-metadata");
    await depositTx.wait();

    // Check that one NFT is minted.
    expect((await nft.balanceOf(addr1.address)).toString()).to.equal("1");
    expect(await nft.tokenURI(0)).to.equal("ipfs://test-metadata");
    expect((await nft.faceValue(0)).toString()).to.equal("100");

    // addr1's balance should drop by exactly 100 tokens.
    const finalBal = await stableCoin.balanceOf(addr1.address);
    expect(finalBal.toString()).to.equal(ethers.utils.parseUnits("900", 18).toString());

    // Redeem the NFT.
    const balBeforeRedeem = await stableCoin.balanceOf(addr1.address);
    const redeemTx = await vault.connect(addr1).redeem(0);
    await redeemTx.wait();
    expect((await nft.balanceOf(addr1.address)).toString()).to.equal("0");
    const balAfterRedeem = await stableCoin.balanceOf(addr1.address);
    expect(balAfterRedeem.sub(balBeforeRedeem).toString()).to.equal(
      ethers.utils.parseUnits("100", 18).toString()
    );
  });
});

describe("MultiToken Contracts", function () {
  let wbtc, weth, wltc;
  let multiNFT, multiVault;
  let owner, user;
  // The required deposit amounts (in 18-decimal base units)
  const REQUIRED_WBTC = ethers.utils.parseUnits("0.05", 18);
  const REQUIRED_WETH = ethers.utils.parseUnits("0.5", 18);
  const REQUIRED_WLTC = ethers.utils.parseUnits("3", 18);

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy three ERC20 tokens using MyERC20Token.
    const MyERC20Token = await ethers.getContractFactory("MyERC20Token");
    const initialSupply = ethers.utils.parseUnits("1000", 18);
    wbtc = await MyERC20Token.deploy("WBTC", "WBTC", initialSupply);
    await wbtc.deployed();
    weth = await MyERC20Token.deploy("WETH", "WETH", initialSupply);
    await weth.deployed();
    wltc = await MyERC20Token.deploy("WLTC", "WLTC", initialSupply);
    await wltc.deployed();

    // Transfer the required amounts to the user.
    await wbtc.transfer(user.address, REQUIRED_WBTC);
    await weth.transfer(user.address, REQUIRED_WETH);
    await wltc.transfer(user.address, REQUIRED_WLTC);

    // Deploy MultiTokenNFT.
    const MultiTokenNFT = await ethers.getContractFactory("MultiTokenNFT");
    multiNFT = await MultiTokenNFT.deploy("MultiTokenNFT", "MTNFT");
    await multiNFT.deployed();
    let tx = await multiNFT.setBaseURI("https://example.com/multitoken/");
    await tx.wait();

    // Deploy MultiTokenVault.
    // Note: The depositAmount parameter is provided for ABI uniformity and is ignored.
    const MultiTokenVault = await ethers.getContractFactory("MultiTokenVault");
    multiVault = await MultiTokenVault.deploy(wbtc.address, weth.address, wltc.address, multiNFT.address);
    await multiVault.deployed();
    tx = await multiNFT.setVaultContract(multiVault.address);
    await tx.wait();
  });

  it("should deposit the required tokens and mint an NFT, then redeem to return tokens", async function () {
    // Approve the vault for each token.
    await wbtc.connect(user).approve(multiVault.address, REQUIRED_WBTC);
    await weth.connect(user).approve(multiVault.address, REQUIRED_WETH);
    await wltc.connect(user).approve(multiVault.address, REQUIRED_WLTC);

    // Record initial balances for user and vault.
    const userWbtcBefore = await wbtc.balanceOf(user.address);
    const userWethBefore = await weth.balanceOf(user.address);
    const userWlbtcBefore = await wltc.balanceOf(user.address);
    const vaultWbtcBefore = await wbtc.balanceOf(multiVault.address);
    const vaultWethBefore = await weth.balanceOf(multiVault.address);
    const vaultWlbtcBefore = await wltc.balanceOf(multiVault.address);

    // User deposits (passing 0 as the dummy depositAmount).
    const depositTx = await multiVault.connect(user).deposit(0, "ipfs://multi-test-metadata");
    await depositTx.wait();

    // Check NFT minted.
    expect((await multiNFT.balanceOf(user.address)).toString()).to.equal("1");
    expect(await multiNFT.tokenURI(0)).to.equal("ipfs://multi-test-metadata");

    // Verify user's token balances decreased by the required amounts.
    const userWbtcAfter = await wbtc.balanceOf(user.address);
    const userWethAfter = await weth.balanceOf(user.address);
    const userWlbtcAfter = await wltc.balanceOf(user.address);
    expect(userWbtcBefore.sub(userWbtcAfter).toString()).to.equal(REQUIRED_WBTC.toString());
    expect(userWethBefore.sub(userWethAfter).toString()).to.equal(REQUIRED_WETH.toString());
    expect(userWlbtcBefore.sub(userWlbtcAfter).toString()).to.equal(REQUIRED_WLTC.toString());

    // Verify vault's balances increased.
    const vaultWbtcAfter = await wbtc.balanceOf(multiVault.address);
    const vaultWethAfter = await weth.balanceOf(multiVault.address);
    const vaultWlbtcAfter = await wltc.balanceOf(multiVault.address);
    expect(vaultWbtcAfter.sub(vaultWbtcBefore).toString()).to.equal(REQUIRED_WBTC.toString());
    expect(vaultWethAfter.sub(vaultWethBefore).toString()).to.equal(REQUIRED_WETH.toString());
    expect(vaultWlbtcAfter.sub(vaultWlbtcBefore).toString()).to.equal(REQUIRED_WLTC.toString());

    // Redeem NFT.
    const userWbtcBeforeRedeem = await wbtc.balanceOf(user.address);
    const userWethBeforeRedeem = await weth.balanceOf(user.address);
    const userWlbtcBeforeRedeem = await wltc.balanceOf(user.address);

    const redeemTx = await multiVault.connect(user).redeem(0);
    await redeemTx.wait();

    // NFT should be burned.
    expect((await multiNFT.balanceOf(user.address)).toString()).to.equal("0");

    // User's token balances should increase by the required amounts.
    const userWbtcAfterRedeem = await wbtc.balanceOf(user.address);
    const userWethAfterRedeem = await weth.balanceOf(user.address);
    const userWlbtcAfterRedeem = await wltc.balanceOf(user.address);
    expect(userWbtcAfterRedeem.sub(userWbtcBeforeRedeem).toString()).to.equal(REQUIRED_WBTC.toString());
    expect(userWethAfterRedeem.sub(userWethBeforeRedeem).toString()).to.equal(REQUIRED_WETH.toString());
    expect(userWlbtcAfterRedeem.sub(userWlbtcBeforeRedeem).toString()).to.equal(REQUIRED_WLTC.toString());
  });
});
