import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";

const { mockLogin, mockNavigate } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  mockLogin.mockReset();
  mockLogin.mockResolvedValue(undefined);
  mockNavigate.mockReset();
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

function fillForm(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: password },
  });
}

function submitForm() {
  const form = screen
    .getByRole("button", { name: /continue/i })
    .closest("form");
  fireEvent.submit(form!);
}

describe("Login", () => {
  it("renders the login form", () => {
    renderLogin();
    expect(
      screen.getByRole("heading", { name: /login/i }),
    ).toBeInTheDocument();
  });

  it("renders an email input", () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("renders a password input", () => {
    renderLogin();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("renders a login button", () => {
    renderLogin();
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).toBeInTheDocument();
  });

  it("hides the password by default", () => {
    renderLogin();
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      "type",
      "password",
    );
  });
});

describe("Login validation", () => {
  it("shows an error when email is empty", () => {
    renderLogin();
    fillForm("", "password123");
    submitForm();

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("shows an error when password is empty", () => {
    renderLogin();
    fillForm("user@example.com", "");
    submitForm();

    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("shows an error for an invalid email format", () => {
    renderLogin();
    fillForm("not-an-email", "password123");
    submitForm();

    expect(
      screen.getByText(/please enter a valid email address/i),
    ).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("shows an error when the password is too short", () => {
    renderLogin();
    fillForm("user@example.com", "short");
    submitForm();

    expect(
      screen.getByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("trims leading and trailing spaces from the email before submitting", async () => {
    renderLogin();
    fillForm("  user@example.com  ", "password123");
    submitForm();

    await vi.waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(mockLogin).toHaveBeenCalledWith("user@example.com", "password123");
  });

  it("navigates to the dashboard after a successful login", async () => {
    renderLogin();
    fillForm("user@example.com", "password123");
    submitForm();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/chat"));
  });
});

describe("Login interactions", () => {
  it("allows the user to type into the email and password inputs", async () => {
    const user = userEvent.setup();
    renderLogin();

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);

    await user.type(emailInput, "user@example.com");
    await user.type(passwordInput, "password123");

    expect(emailInput).toHaveValue("user@example.com");
    expect(passwordInput).toHaveValue("password123");
  });

  it("toggles password visibility when the show/hide button is clicked", async () => {
    const user = userEvent.setup();
    renderLogin();

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("submits the form when Enter is pressed", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "password123{enter}");

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        "user@example.com",
        "password123",
      ),
    );
  });

  it("disables the login button while the login request is loading", async () => {
    let resolveLogin: () => void = () => {};
    mockLogin.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        }),
    );

    renderLogin();
    fillForm("user@example.com", "password123");
    const button = screen.getByRole("button", { name: /continue/i });

    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());

    resolveLogin();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
