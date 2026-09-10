import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ReactLenis } from "lenis/react";
import Login from "./components/Login";
import Register from "./components/Register";
import Chat from "./components/Chat";
import PrivateRoute from "./components/PrivateRouter";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import AuthScene from "./components/intro/AuthScene";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* A pathless layout route: AuthScene (the character, wearing whichever
          form is routed to) stays mounted across /login <-> /register, which
          is what lets the character step back for the taller register form
          instead of the page remounting it. */}
      <Route element={<AuthScene />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
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
