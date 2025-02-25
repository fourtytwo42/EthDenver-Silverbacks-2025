import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import chains from "./chains.json";

const ChainSelector = () => {
  const [currentChain, setCurrentChain] = useState(null);
  const [supported, setSupported] = useState(true);
  const [selectedChainId, setSelectedChainId] = useState("");

  // Fetch the current chain from MetaMask
  const fetchCurrentChain = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        const chainIdHex = "0x" + network.chainId.toString(16);
        setCurrentChain(chainIdHex);
        setSupported(!!chains[chainIdHex]);
      } catch (error) {
        console.error("Error fetching network:", error);
      }
    }
  };

  useEffect(() => {
    fetchCurrentChain();
    if (window.ethereum) {
      window.ethereum.on("chainChanged", (chainId) => {
        setCurrentChain(chainId);
        setSupported(!!chains[chainId]);
      });
    }
  }, []);

  // Switch network using MetaMask
  const switchNetwork = async (targetChainId) => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }]
      });
    } catch (switchError) {
      // Error code 4902 indicates the chain hasn't been added.
      if (switchError.code === 4902) {
        const chainData = chains[targetChainId];
        if (!chainData) {
          alert("Chain parameters not found. Please select a supported chain.");
          return;
        }
        // Remove unsupported keys (like "contracts") from the parameters.
        const { contracts, ...paramsWithoutContracts } = chainData;
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [paramsWithoutContracts]
          });
        } catch (addError) {
          console.error("Error adding chain:", addError);
        }
      } else {
        console.error("Error switching chain:", switchError);
      }
    }
  };

  const handleSelectChange = (e) => {
    const targetChainId = e.target.value;
    setSelectedChainId(targetChainId);
  };

  const handleSwitchClick = async () => {
    if (selectedChainId) {
      await switchNetwork(selectedChainId);
      fetchCurrentChain();
    }
  };

  return (
    <div style={{ padding: "1rem", borderBottom: "1px solid #ccc" }}>
      {currentChain ? (
        <>
          <p>
            <strong>Connected Network:</strong> {currentChain}{" "}
            {supported ? (
              <>({chains[currentChain].chainName})</>
            ) : (
              <span style={{ color: "red" }}>
                (Unsupported – please switch to one of the supported chains below)
              </span>
            )}
          </p>
          {!supported && (
            <div>
              <label htmlFor="chainSelect">
                Select a supported network:
              </label>
              <select id="chainSelect" onChange={handleSelectChange} defaultValue="">
                <option value="" disabled>
                  -- Select Network --
                </option>
                {Object.keys(chains).map((chainId) => (
                  <option key={chainId} value={chainId}>
                    {chains[chainId].chainName} ({chainId})
                  </option>
                ))}
              </select>
              <button onClick={handleSwitchClick} style={{ marginLeft: "1rem" }}>
                Switch Network
              </button>
            </div>
          )}
        </>
      ) : (
        <p>Loading network info…</p>
      )}
    </div>
  );
};

export default ChainSelector;
