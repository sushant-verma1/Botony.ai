import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PrivateRoute from "./PrivateRouter";

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

function renderProtectedRoute(isLoggedIn: boolean) {
  mockUseAuth.mockReturnValue({ isLoggedIn });

  return render(
    <MemoryRouter initialEntries={["/chat"]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/chat"
          element={
            <PrivateRoute>
              <div>Dashboard Page</div>
            </PrivateRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PrivateRoute", () => {
  it("redirects unauthenticated users to the login page", () => {
    renderProtectedRoute(false);

    expect(screen.getByText(/login page/i)).toBeInTheDocument();
    expect(screen.queryByText(/dashboard page/i)).not.toBeInTheDocument();
  });

  it("renders the protected content for authenticated users", () => {
    renderProtectedRoute(true);

    expect(screen.getByText(/dashboard page/i)).toBeInTheDocument();
    expect(screen.queryByText(/login page/i)).not.toBeInTheDocument();
  });
});
