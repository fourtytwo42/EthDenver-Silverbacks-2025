require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

const { PRIVATE_KEY, RPC_URL } = process.env;

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  // Use Hardhat's built-in local network by default.
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      // Hardhat's built-in network with default settings.
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};
