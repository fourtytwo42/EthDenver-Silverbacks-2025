import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import chains from "./chains.json";

const ChainSelector = () => {
  const [currentChain, setCurrentChain] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const dropdownTriggerRef = useRef(null);

  // Fetch the current network chainId from MetaMask.
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

  // Attempt to switch to the selected network.
  const switchNetwork = async (targetChainId) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }],
      });
      fetchCurrentChain();
    } catch (switchError) {
      // If the network is not added, prompt MetaMask to add it.
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

  // Handle chain selection.
  const handleSelectChain = async (chainId) => {
    await switchNetwork(chainId);
  };

  // Initialize Materialize dropdown with our container option.
  useEffect(() => {
    if (window.M && dropdownTriggerRef.current) {
      window.M.Dropdown.init(dropdownTriggerRef.current, {
        coverTrigger: false,
        constrainWidth: false,
        // Append the dropdown to our container so its positioning is relative to it
        container: document.querySelector(".chain-selector-container"),
      });
    }
  }, []);

  return (
    <div
      className="chain-selector-container"
      style={{
        width: "100%",
        position: "relative",
        textAlign: "center",
      }}
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
      <ul
        id="chainDropdown"
        className="dropdown-content"
        style={{ marginTop: "10px" }}
      >
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
