import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Todos from "./pages/Todos.jsx";
import Ledger from "./pages/Ledger.jsx";
import News from "./pages/News.jsx";
import Games from "./pages/Games.jsx";
import Agents from "./pages/Agents.jsx";
import Settings from "./pages/Settings.jsx";
import Login from "./pages/Login.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/todos" element={<Todos />} />
        <Route path="/ledger" element={<Ledger />} />
        <Route path="/news" element={<News />} />
        <Route path="/games" element={<Games />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
