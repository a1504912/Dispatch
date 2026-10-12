import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Agents from "./pages/Agents.jsx";
import Analytics from "./pages/Analytics.jsx";
import Content from "./pages/Content.jsx";
import Pillars from "./pages/Pillars.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/content" element={<Content />} />
        <Route path="/pillars" element={<Pillars />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/agents" element={<Agents />} />
      </Route>
    </Routes>
  );
}
