// src/App.js
import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import RedemptionPage from "./RedemptionPage";
import AdminPage from "./AdminPage";
import Header from "./Header";

const AppContent = ({ currentAccount, setCurrentAccount }) => {
  const location = useLocation();
  // Do not render the header on the redemption route ("/")
  const showHeader = location.pathname !== "/";
  return (
    <>
      {showHeader && <Header currentAccount={currentAccount} setCurrentAccount={setCurrentAccount} />}
      <div style={mainContainerStyle}>
        <Routes>
          <Route path="/" element={<RedemptionPage currentAccount={currentAccount} setCurrentAccount={setCurrentAccount} />} />
          <Route path="/admin" element={<AdminPage currentAccount={currentAccount} />} />
        </Routes>
      </div>
    </>
  );
};

const mainContainerStyle = {
  padding: 0, // full-screen mobile experience
  backgroundColor: "#f9f9f9",
  minHeight: "100vh"
};

function App() {
  const [currentAccount, setCurrentAccount] = useState(null);
  return (
    <Router>
      <AppContent currentAccount={currentAccount} setCurrentAccount={setCurrentAccount} />
    </Router>
  );
}

export default App;
