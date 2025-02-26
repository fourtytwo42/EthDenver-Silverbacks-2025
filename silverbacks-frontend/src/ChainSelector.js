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

  /**
   * Build a valid object for MetaMask's wallet_addEthereumChain
   * from our custom chain data in chains.json.
   */
  const buildAddChainParams = (chainIdHex) => {
    const chainData = chains[chainIdHex];
    if (!chainData) return null;

    // Some typical fields that MetaMask expects:
    // - chainId (hex string)
    // - chainName (no spaces or any format you like)
    // - rpcUrls (array of strings)
    // - blockExplorerUrls (array of strings)
    // - nativeCurrency (object with name, symbol, decimals)
    return {
      chainId: chainIdHex,
      chainName: chainData.chainName || "Unknown Network",
      rpcUrls: chainData.rpc ? [chainData.rpc] : [],
      blockExplorerUrls: chainData.explorer ? [chainData.explorer] : [],
      nativeCurrency: {
        name: "ETH",       // or "Sepolia ETH" / "Linea ETH" etc.
        symbol: "ETH",     // or "SEP", "LINEA", etc. as desired
        decimals: 18
      }
    };
  };

  // Attempt to switch to the selected network.
  const switchNetwork = async (targetChainId) => {
    if (!window.ethereum) return;
    try {
      // First try a direct chain switch.
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }]
      });
      fetchCurrentChain();
    } catch (switchError) {
      // If the chain is not added in MetaMask, we must "addEthereumChain".
      if (switchError.code === 4902) {
        const addParams = buildAddChainParams(targetChainId);
        if (!addParams) {
          alert("Chain parameters not found in chains.json.");
          return;
        }
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [addParams]
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

  // Handle chain selection from the dropdown.
  const handleSelectChain = async (chainId) => {
    await switchNetwork(chainId);
  };

  // Initialize Materialize dropdown with our container option.
  useEffect(() => {
    if (window.M && dropdownTriggerRef.current) {
      window.M.Dropdown.init(dropdownTriggerRef.current, {
        coverTrigger: false,
        constrainWidth: false,
        container: document.querySelector(".chain-selector-container")
      });
    }
  }, []);

  return (
    <div
      className="chain-selector-container"
      style={{
        width: "100%",
        position: "relative",
        textAlign: "center"
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
          minWidth: "200px"
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
          <li
            key={chainId}
            className={chainId === currentChain ? "active" : ""}
          >
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
