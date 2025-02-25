import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import chains from "./chains.json";

const ChainSelector = () => {
  const [currentChain, setCurrentChain] = useState("");
  const [isSupported, setIsSupported] = useState(true);

  // Fetch the current chain from MetaMask and update state.
  const fetchCurrentChain = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        const chainIdHex = "0x" + network.chainId.toString(16);
        setCurrentChain(chainIdHex);
        setIsSupported(!!chains[chainIdHex]);
      } catch (error) {
        console.error("Error fetching network:", error);
      }
    }
  };

  useEffect(() => {
    fetchCurrentChain();
    // Listen for chain changes.
    if (window.ethereum) {
      const handleChainChanged = (chainId) => {
        setCurrentChain(chainId);
        setIsSupported(!!chains[chainId]);
      };
      window.ethereum.on("chainChanged", handleChainChanged);
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("chainChanged", handleChainChanged);
        }
      };
    }
  }, []);

  // Attempt to switch the network.
  const switchNetwork = async (targetChainId) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }],
      });
      fetchCurrentChain();
    } catch (switchError) {
      // If the chain is not added to MetaMask, attempt to add it.
      if (switchError.code === 4902) {
        const chainData = chains[targetChainId];
        if (!chainData) {
          alert("Chain parameters not found. Please select a supported chain.");
          return;
        }
        const { contracts, ...paramsWithoutContracts } = chainData;
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [paramsWithoutContracts],
          });
          fetchCurrentChain();
        } catch (addError) {
          console.error("Error adding chain:", addError);
        }
      } else {
        console.error("Error switching chain:", switchError);
      }
    }
  };

  // When the user selects a different network, immediately trigger the switch.
  const handleChainChange = async (e) => {
    const newChain = e.target.value;
    if (newChain !== currentChain) {
      await switchNetwork(newChain);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <p style={{ margin: 0, fontSize: "0.9rem", marginRight: "0.5rem" }}>
        {isSupported
          ? `${chains[currentChain]?.chainName || "Unknown"} (${currentChain})`
          : `Unsupported network (${currentChain})`}
      </p>
      <select value={currentChain} onChange={handleChainChange}>
        {Object.keys(chains).map((chainId) => (
          <option key={chainId} value={chainId}>
            {chains[chainId].chainName} ({chainId})
          </option>
        ))}
      </select>
    </div>
  );
};

export default ChainSelector;
