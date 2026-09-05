import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api/api";
import Spinner from "./Spinner";

interface RegisterForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  age: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  age?: string;
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
    age: "",
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedNotMedicalAdvice, setAgreedNotMedicalAdvice] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    if (!form.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!form.password) {
      newErrors.password = "Password is required";
    } else if (form.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    if (!form.age) {
      newErrors.age = "age is required";
    } else if (Number(form.age) < 13) {
      newErrors.age = "You must be at least 13 years old to register";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    if (!agreedToTerms) {
      toast.error("You must accept the Terms of Service and Privacy Policy");
      return;
    }
    if (!agreedNotMedicalAdvice) {
      toast.error("You must acknowledge this is not medical advice");
      return;
    }
    setLoading(true);
    try {
      await authAPI.register(
        form.email,
        form.password,
        form.firstName,
        form.lastName,
        form.age,
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
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                First Name
              </label>{" "}
              <input
                id="firstName"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />{" "}
              {errors.firstName && (
                <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>
              )}
            </div>{" "}
            <div>
              {" "}
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Last Name
              </label>{" "}
              <input
                id="lastName"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />{" "}
              {errors.lastName && (
                <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>
              )}
            </div>{" "}
          </div>{" "}
          <div>
            {" "}
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>{" "}
            <input
              id="email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />{" "}
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>{" "}
          <div>
            {" "}
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password (min 8 chars)
            </label>{" "}
            <input
              id="password"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />{" "}
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password}</p>
            )}
          </div>{" "}
          <div>
            <label
              htmlFor="age"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Age
            </label>
            <input
              id="age"
              name="age"
              type="number"
              value={form.age}
              onChange={handleChange}
              min={13}
              className={`w-full border rounded-lg px-3 py-2 ${
                errors.age ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="Age"
            />
            <p className="text-xs text-gray-400 mt-1">
              You must be 13 or older to use this service
            </p>
            {errors.age && (
              <p className="text-red-500 text-sm mt-1">{errors.age}</p>
            )}
          </div>
          <div className="flex items-start gap-2">
            <input
              id="agreedToTerms"
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="agreedToTerms" className="text-sm text-gray-600">
              I agree to the{" "}
              <a
                href="/TERMS.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="/PRIVACY.MD"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Privacy Policy
              </a>
            </label>
          </div>
          <div className="flex items-start gap-2">
            <input
              id="agreedNotMedicalAdvice"
              type="checkbox"
              checked={agreedNotMedicalAdvice}
              onChange={(e) => setAgreedNotMedicalAdvice(e.target.checked)}
              className="mt-1"
            />
            <label
              htmlFor="agreedNotMedicalAdvice"
              className="text-sm text-gray-600"
            >
              I understand this is not a substitute for professional medical
              advice
            </label>
          </div>
          <button
            type="submit"
            disabled={loading || !agreedToTerms || !agreedNotMedicalAdvice}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            {loading ? "Creating..." : "Create Account"}
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
