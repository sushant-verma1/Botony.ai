import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ReactLenis } from "lenis/react";
import Login from "./components/Login";
import Register from "./components/Register";
import Chat from "./components/Chat";
import PrivateRoute from "./components/PrivateRouter";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/chat"
        element={
          <PrivateRoute>
            <Chat />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      {/* Page-level smooth scrolling only — the hero character's animation
          timeline is driven separately and is never wired to Lenis. Lenis
          honours prefers-reduced-motion itself, so no extra check is needed
          here. */}
      <ReactLenis root options={{ anchors: true }} />
      <Toaster position="top-right" />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
