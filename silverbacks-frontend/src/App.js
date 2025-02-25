import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import RedemptionPage from "./RedemptionPage";
import AdminPage from "./AdminPage";

function App() {
  return (
    <Router>
      <nav style={{ padding: "1rem", backgroundColor: "#eee" }}>
        <Link to="/" style={{ marginRight: "1rem" }}>Redemption</Link>
        <Link to="/admin">Admin</Link>
      </nav>
      <Routes>
        <Route path="/" element={<RedemptionPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </Router>
  );
}

export default App;
