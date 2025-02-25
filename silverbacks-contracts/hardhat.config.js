require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

const { PRIVATE_KEY, RPC_URL, LINEA_RPC_URL } = process.env;

if (!RPC_URL) {
  throw new Error("Please set your RPC_URL in the .env file");
}
if (!LINEA_RPC_URL) {
  throw new Error("Please set your LINEA_RPC_URL in the .env file");
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    linea: {
      url: LINEA_RPC_URL,
      chainId: 59141, // Updated to match the network where you have funds
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
