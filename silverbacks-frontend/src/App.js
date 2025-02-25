import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import RedemptionPage from "./RedemptionPage";
import AdminPage from "./AdminPage";
import Header from "./Header";

function App() {
  const [currentAccount, setCurrentAccount] = useState(null);

  return (
    <Router>
      <Header currentAccount={currentAccount} setCurrentAccount={setCurrentAccount} />
      <div style={mainContainerStyle}>
        <Routes>
          <Route path="/" element={<RedemptionPage currentAccount={currentAccount} />} />
          <Route path="/admin" element={<AdminPage currentAccount={currentAccount} />} />
        </Routes>
      </div>
    </Router>
  );
}

const mainContainerStyle = {
  padding: "2rem",
  backgroundColor: "#f9f9f9",
  minHeight: "calc(100vh - 80px)" // Adjust according to header height
};

export default App;
