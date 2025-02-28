require("@nomiclabs/hardhat-ethers");
require("@matterlabs/hardhat-zksync-deploy");
require("@matterlabs/hardhat-zksync-solc");
require("dotenv").config();

const {
  PRIVATE_KEY,
  RPC_URL,
  LINEA_RPC_URL,
  FLOW_TESTNET_RPC_URL,
  U2U_RPC_URL,
  UNICHAIN_SEPOLIA_RPC_URL,
  ZIRCUIT_TESTNET_RPC_URL,
  ZKSYNC_SEPOLIA_RPC_URL
} = process.env;

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
if (!UNICHAIN_SEPOLIA_RPC_URL) {
  throw new Error("Please set your UNICHAIN_SEPOLIA_RPC_URL in the .env file");
}
if (!ZIRCUIT_TESTNET_RPC_URL) {
  throw new Error("Please set your ZIRCUIT_TESTNET_RPC_URL in the .env file");
}
if (!ZKSYNC_SEPOLIA_RPC_URL) {
  throw new Error("Please set your ZKSYNC_SEPOLIA_RPC_URL in the .env file");
}

module.exports = {
  // zkSync-specific compiler settings.
  zksolc: {
    version: "1.3.5", // Change if needed.
    compilerSource: "binary",
    settings: {}
  },
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
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    linea: {
      url: LINEA_RPC_URL,
      chainId: 59141,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    flowtestnet: {
      url: FLOW_TESTNET_RPC_URL,
      // Optionally add chainId if known.
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    u2u: {
      url: U2U_RPC_URL,
      chainId: 2484,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    unichain_sepolia: {
      url: UNICHAIN_SEPOLIA_RPC_URL,
      chainId: 1301,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    zircuit_testnet: {
      url: ZIRCUIT_TESTNET_RPC_URL,
      chainId: 48899,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    zksync_sepolia: {
      url: ZKSYNC_SEPOLIA_RPC_URL,
      chainId: 300,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      zksync: true
    }
  }
};
