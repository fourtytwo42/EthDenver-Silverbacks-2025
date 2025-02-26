import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import ChainSelector from "./ChainSelector";

// Helper to shorten the wallet address (e.g. 0x1234...abcd)
const shortenAddress = (address) => {
  if (!address) return "";
  return address.slice(0, 6) + "..." + address.slice(-4);
};

const Header = ({ currentAccount, setCurrentAccount }) => {
  useEffect(() => {
    const storedAccount = localStorage.getItem("currentAccount");
    if (storedAccount) {
      setCurrentAccount(storedAccount);
    }
  }, [setCurrentAccount]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask is not installed!");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const account = accounts[0];
      setCurrentAccount(account);
      localStorage.setItem("currentAccount", account);
    } catch (error) {
      console.error("Error connecting wallet:", error);
    }
  };

  const disconnectWallet = () => {
    setCurrentAccount(null);
    localStorage.removeItem("currentAccount");
  };

  return (
    <nav className="blue darken-3">
      <div
        className="nav-wrapper container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        {/* Left Section: Logo */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link to="/" className="brand-logo" style={{ marginRight: "20px" }}>
            Silverbacks
          </Link>
        </div>
        {/* Center Section: Chain Selector */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <ChainSelector />
        </div>
        {/* Right Section: Wallet Connect/Disconnect */}
        <div>
          {currentAccount ? (
            <button onClick={disconnectWallet} className="btn waves-effect waves-light">
              {shortenAddress(currentAccount)}
            </button>
          ) : (
            <button onClick={connectWallet} className="btn waves-effect waves-light">
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Header;
