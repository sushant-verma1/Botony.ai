import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Register from "./Register";
import toast from "react-hot-toast";

const { mockLogin, mockNavigate, mockRegister } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockNavigate: vi.fn(),
  mockRegister: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

vi.mock("../services/api/api", () => ({
  authAPI: {
    register: mockRegister,
  },
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

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  mockLogin.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockReset();
  mockRegister.mockReset().mockResolvedValue({
    data: {
      message: "ok",
      id: "user-1",
      user: { name: "Jane Doe", email: "jane@example.com" },
      accessToken: "token",
    },
  });
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/first name/i), {
    target: { value: "Jane" },
  });
  fireEvent.change(screen.getByLabelText(/last name/i), {
    target: { value: "Doe" },
  });
  fireEvent.change(screen.getByLabelText(/^email$/i), {
    target: { value: "jane@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: "password123" },
  });
  fireEvent.change(screen.getByLabelText(/age/i), {
    target: { value: "20" },
  });
}

function submitForm() {
  const form = screen
    .getByRole("button", { name: /create account/i })
    .closest("form");
  fireEvent.submit(form!);
}

describe("Register", () => {
  it("renders the registration form", () => {
    renderRegister();
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it("renders the name, email, password and age inputs", () => {
    renderRegister();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/age/i)).toBeInTheDocument();
  });

  it("renders the terms and medical advice checkboxes", () => {
    renderRegister();
    expect(
      screen.getByRole("checkbox", { name: /terms of service/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /not a substitute/i }),
    ).toBeInTheDocument();
  });

  it("links to the terms and privacy policy pages", () => {
    renderRegister();
    expect(
      screen.getByRole("link", { name: /terms of service/i }),
    ).toHaveAttribute("href", "/TERMS.md");
    expect(
      screen.getByRole("link", { name: /privacy policy/i }),
    ).toHaveAttribute("href", "/PRIVACY.MD");
  });

  it("disables the submit button until every field and both checkboxes are done", async () => {
    const user = userEvent.setup();
    renderRegister();
    const button = screen.getByRole("button", { name: /create account/i });
    expect(button).toBeDisabled();

    // Every field filled is not enough on its own — the consents still gate it.
    fillValidForm();
    expect(button).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: /terms of service/i }),
    );
    expect(button).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: /not a substitute/i }),
    );
    expect(button).not.toBeDisabled();
  });

  it("keeps it disabled when a field is missing but both consents are given", async () => {
    const user = userEvent.setup();
    renderRegister();
    fillValidForm();
    fireEvent.change(screen.getByLabelText(/age/i), { target: { value: "" } });

    await user.click(
      screen.getByRole("checkbox", { name: /terms of service/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /not a substitute/i }),
    );

    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeDisabled();
  });
});

describe("Register validation", () => {
  it("shows errors when required fields are empty", () => {
    renderRegister();
    submitForm();

    expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/last name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(screen.getByText(/age is required/i)).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("shows an error for an invalid email format", () => {
    renderRegister();
    fillValidForm();
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "not-an-email" },
    });
    submitForm();

    expect(
      screen.getByText(/please enter a valid email address/i),
    ).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("shows an error when the password is too short", () => {
    renderRegister();
    fillValidForm();
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "short" },
    });
    submitForm();

    expect(
      screen.getByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("shows an error when age is under 13", () => {
    renderRegister();
    fillValidForm();
    fireEvent.change(screen.getByLabelText(/age/i), {
      target: { value: "10" },
    });
    submitForm();

    expect(
      screen.getByText(/must be at least 13 years old/i),
    ).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("blocks submission until both checkboxes are agreed to, even with valid data", () => {
    renderRegister();
    fillValidForm();
    submitForm();

    expect(mockRegister).not.toHaveBeenCalled();
  });
});

describe("Register submission", () => {
  it("registers, logs in, and navigates to the dashboard on success", async () => {
    const user = userEvent.setup();
    renderRegister();
    fillValidForm();

    await user.click(
      screen.getByRole("checkbox", { name: /terms of service/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /not a substitute/i }),
    );
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(
        "jane@example.com",
        "password123",
        "Jane",
        "Doe",
        "20",
      ),
    );
    expect(mockLogin).toHaveBeenCalledWith("jane@example.com", "password123");
    expect(mockNavigate).toHaveBeenCalledWith("/chat");
  });

  it("shows an error toast when registration fails", async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValue({
      response: { data: { message: "Email already registered" } },
    });

    renderRegister();
    fillValidForm();

    await user.click(
      screen.getByRole("checkbox", { name: /terms of service/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /not a substitute/i }),
    );
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Email already registered"),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
