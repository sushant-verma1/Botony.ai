import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api/api";

interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

interface ErrorResponse {
  message: string;
}

export default function Register() {
  const [form, setForm] = useState<RegisterForm>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();

    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      await authAPI.register(
        form.email,
        form.password,
        form.firstName,
        form.lastName,
      );

      await login(form.email, form.password);

      toast.success("Account created!");
      navigate("/chat");
    } catch (err) {
      const error = err as AxiosError<ErrorResponse>;

      toast.error(error.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      {" "}
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md">
        {" "}
        <h1 className="text-2xl font-bold mb-6 text-gray-800">
          Create Account
        </h1>{" "}
        <form onSubmit={handleSubmit} className="space-y-4">
          {" "}
          <div className="grid grid-cols-2 gap-3">
            {" "}
            <div>
              {" "}
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>{" "}
              <input
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />{" "}
            </div>{" "}
            <div>
              {" "}
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>{" "}
              <input
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />{" "}
            </div>{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>{" "}
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password (min 8 chars)
            </label>{" "}
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />{" "}
          </div>{" "}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {" "}
            {loading ? "Creating..." : "Create Account"}{" "}
          </button>{" "}
        </form>{" "}
        <p className="mt-4 text-sm text-center text-gray-600">
          {" "}
          Have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>{" "}
        </p>{" "}
      </div>{" "}
    </div>
  );
}
