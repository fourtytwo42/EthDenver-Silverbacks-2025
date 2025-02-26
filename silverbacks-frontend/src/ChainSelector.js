import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import chains from "./chains.json";

const ChainSelector = () => {
  const [currentChain, setCurrentChain] = useState("");
  const [isSupported, setIsSupported] = useState(true);
  const dropdownTriggerRef = useRef(null);

  // Attempt to switch network to the target chain.
  const switchNetwork = async (targetChainId) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainId }],
      });
      fetchCurrentChain();
    } catch (switchError) {
      // If the chain is not added, try to add it.
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
          fetchCurrentChain();
        } catch (addError) {
          console.error("Error adding chain:", addError);
        }
      } else {
        console.error("Error switching chain:", switchError);
      }
    }
  };

  // Build parameters for wallet_addEthereumChain from chains.json.
  const buildAddChainParams = (chainIdHex) => {
    const chainData = chains[chainIdHex];
    if (!chainData) return null;
    return {
      chainId: chainIdHex,
      chainName: chainData.chainName || "Unknown Network",
      rpcUrls: chainData.rpc ? [chainData.rpc] : [],
      blockExplorerUrls: chainData.explorer ? [chainData.explorer] : [],
      nativeCurrency: {
        name: "ETH",
        symbol: "ETH",
        decimals: 18,
      },
    };
  };

  // Fetch the current network chainId from MetaMask.
  const fetchCurrentChain = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        let chainIdHex = "0x" + network.chainId.toString(16);
        // If the current chain is Mainnet (0x1), automatically switch to Sepolia.
        if (chainIdHex === "0x1") {
          console.log("Mainnet detected. Switching to Sepolia testnet...");
          await switchNetwork("0xAA36A7");
          const networkAfter = await provider.getNetwork();
          chainIdHex = "0x" + networkAfter.chainId.toString(16);
        }
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

  const handleSelectChain = async (chainId) => {
    await switchNetwork(chainId);
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
