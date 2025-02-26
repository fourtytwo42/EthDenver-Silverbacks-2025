// silverbacks-frontend/src/ChainSelector.js

import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import chains from "./chains.json";

const ChainSelector = () => {
  const [currentChain, setCurrentChain] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const dropdownTriggerRef = useRef(null);

  // Prompt MetaMask to switch to the target chain.
  const switchNetwork = async (targetChainId) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }],
      });
      // Wait briefly to allow MetaMask to update.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (switchError) {
      if (switchError.code === 4902) {
        const addParams = buildAddChainParams(targetChainId);
        if (!addParams) {
          alert("Chain parameters not found in chains.json.");
          return;
        }
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [addParams],
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (addError) {
          console.error("Error adding chain:", addError);
        }
      } else {
        console.error("Error switching chain:", switchError);
      }
    }
  };

  // Build parameters for wallet_addEthereumChain using data from chains.json.
  const buildAddChainParams = (chainIdHex) => {
    const chainData = chains[chainIdHex];
    if (!chainData) return null;
    return {
      chainId: chainIdHex,
      chainName: chainData.chainName || "Unknown Network",
      rpcUrls: chainData.rpc ? [chainData.rpc] : [],
      blockExplorerUrls: chainData.explorer ? [chainData.explorer] : [],
      nativeCurrency: chainData.nativeCurrency || { name: "ETH", symbol: "ETH", decimals: 18 }
    };
  };

  // Fetch the current network chainId from MetaMask (without forcing a switch).
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
  }, []);

  const handleSelectChain = async (chainId) => {
    await switchNetwork(chainId);
    fetchCurrentChain();
  };

  useEffect(() => {
    if (window.M && dropdownTriggerRef.current) {
      window.M.Dropdown.init(dropdownTriggerRef.current, {
        coverTrigger: false,
        constrainWidth: false,
        container: document.querySelector(".chain-selector-container"),
      });
    }
  }, []);

  return (
    <div
      className="chain-selector-container"
      style={{ width: "100%", position: "relative", textAlign: "center" }}
    >
      <button
        ref={dropdownTriggerRef}
        className="btn dropdown-trigger"
        data-target="chainDropdown"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "200px",
        }}
      >
        {isSupported
          ? (chains[currentChain]?.chainName || "Unknown")
          : "Unsupported Network"}
        <i className="material-icons" style={{ marginLeft: "0.5rem" }}>
          arrow_drop_down
        </i>
      </button>

      <ul id="chainDropdown" className="dropdown-content" style={{ marginTop: "10px" }}>
        {Object.keys(chains).map((chainId) => (
          <li key={chainId} className={chainId === currentChain ? "active" : ""}>
            <a href="#!" onClick={() => handleSelectChain(chainId)}>
              {chains[chainId].chainName}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChainSelector;
