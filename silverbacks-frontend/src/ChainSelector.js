import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import chains from "./chains.json";

const ChainSelector = () => {
  const [currentChain, setCurrentChain] = useState(null);
  const [supported, setSupported] = useState(true);
  const [selectedChainId, setSelectedChainId] = useState("");

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

  const switchNetwork = async (targetChainId) => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }]
      });
    } catch (switchError) {
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
    <div style={{ display: "flex", alignItems: "center" }}>
      {currentChain ? (
        <>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            {supported
              ? `${chains[currentChain].chainName} (${currentChain})`
              : `Unsupported network (${currentChain})`}
          </p>
          {!supported && (
            <div style={{ marginLeft: "1rem" }}>
              <select onChange={handleSelectChange} defaultValue="">
                <option value="" disabled>
                  -- Select Network --
                </option>
                {Object.keys(chains).map((chainId) => (
                  <option key={chainId} value={chainId}>
                    {chains[chainId].chainName} ({chainId})
                  </option>
                ))}
              </select>
              <button onClick={handleSwitchClick} style={{ marginLeft: "0.5rem" }}>
                Switch
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
