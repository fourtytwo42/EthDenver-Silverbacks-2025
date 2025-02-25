import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import ChainSelector from "./ChainSelector";

const Header = ({ currentAccount, setCurrentAccount }) => {
  // On mount, read stored account from localStorage.
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
    <header style={headerStyle}>
      <div style={headerLeftStyle}>
        <Link to="/" style={navLinkStyle}>Redemption</Link>
        <Link to="/admin" style={navLinkStyle}>Admin</Link>
      </div>
      <div style={headerCenterStyle}>
        <ChainSelector />
      </div>
      <div style={headerRightStyle}>
        {currentAccount ? (
          <button onClick={disconnectWallet} style={buttonStyle}>
            Disconnect
          </button>
        ) : (
          <button onClick={connectWallet} style={buttonStyle}>
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "1rem 2rem",
  backgroundColor: "#222",
  color: "#fff"
};

const headerLeftStyle = {
  flex: "1",
  display: "flex",
  alignItems: "center"
};

const headerCenterStyle = {
  flex: "1",
  display: "flex",
  justifyContent: "center"
};

const headerRightStyle = {
  flex: "1",
  display: "flex",
  justifyContent: "flex-end"
};

const navLinkStyle = {
  color: "#fff",
  textDecoration: "none",
  marginRight: "1rem",
  fontSize: "1.1rem"
};

const buttonStyle = {
  padding: "0.5rem 1rem",
  backgroundColor: "#4CAF50",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer"
};

export default Header;
