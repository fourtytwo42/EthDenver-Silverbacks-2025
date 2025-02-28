require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

const { PRIVATE_KEY, RPC_URL, LINEA_RPC_URL, FLOW_TESTNET_RPC_URL, U2U_RPC_URL, STORYAENEID_RPC_URL, SOMNIA_RPC_URL } = process.env;

if (!RPC_URL) {
  throw new Error("Please set your RPC_URL in the .env file");
}
if (!LINEA_RPC_URL) {
  throw new Error("Please set your LINEA_RPC_URL in the .env file");
}
if (!FLOW_TESTNET_RPC_URL) {
  throw new Error("Please set your FLOW_TESTNET_RPC_URL in the .env file");
}
if (!U2U_RPC_URL) {
  throw new Error("Please set your U2U_RPC_URL in the .env file");
}
if (!STORYAENEID_RPC_URL) {
  throw new Error("Please set your STORYAENEID_RPC_URL in the .env file");
}
if (!SOMNIA_RPC_URL) {
  throw new Error("Please set your SOMNIA_RPC_URL in the .env file");
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
      chainId: 59141, // network where you have funds
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    flowtestnet: {
      url: FLOW_TESTNET_RPC_URL,
      chainId: 0, // (chainId is obtained automatically if not specified, but you may set it if known)
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    u2u: {
      url: U2U_RPC_URL,
      chainId: 2484,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    storyaeneid: {
      url: STORYAENEID_RPC_URL,
      chainId: 1315,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    somnia: {
      url: SOMNIA_RPC_URL,
      chainId: 50312,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    }
  },
};
