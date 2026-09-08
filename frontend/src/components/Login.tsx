import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import Spinner from "./Spinner";
import { Button } from "./ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

interface FormErrors {
  email?: string;
  password?: string;
}

/** `embedded` drops the full-page framing and returns the card alone, for
 *  when the form is a part of a composition rather than the page — the hero
 *  sequence hands off to it in place. `onSwitch` replaces the "Register" link
 *  with a callback, for when the other form is going to take this one's place
 *  in situ rather than at another route. Everything else is identical: same
 *  validation, same submit, same redirect. */
export default function Login({
  embedded = false,
  onSwitch,
}: {
  embedded?: boolean;
  onSwitch?: () => void;
}) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success("Logged in!");
      navigate("/chat");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        toast.error(err.response?.data?.message || "Login failed");
      } else {
        toast.error("Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  /* shadcn/ui's Field is the form: it owns the label/control/error grouping
     and the invalid state, so the only markup left here is which control goes
     in which field. Nothing about the submit, the validation or the redirect
     changed with it. */
  const card = (
    <form onSubmit={handleSubmit} className="w-full">
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.email || undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={!!errors.email || undefined}
          />
          <FieldError>{errors.email}</FieldError>
        </Field>

        <Field data-invalid={!!errors.password || undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          {/* The reveal sits inside the field rather than beside it, so the
              control is still one row whatever the field is laid out at. */}
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={!!errors.password || undefined}
              className="pr-14"
            />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-1 my-auto text-muted-foreground"
            >
              {showPassword ? "Hide" : "Show"}
            </Button>
          </div>
          <FieldError>{errors.password}</FieldError>
        </Field>

        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Spinner />}
          {loading ? "Signing in..." : "Sign In"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          {onSwitch ? (
            <button
              type="button"
              onClick={onSwitch}
              className="underline underline-offset-4"
            >
              Register
            </button>
          ) : (
            <Link to="/register" className="underline underline-offset-4">
              Register
            </Link>
          )}
        </p>
      </FieldGroup>
    </form>
  );

  if (embedded) return card;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-md">
        <h1 className="mb-6 text-2xl font-bold">Sign In</h1>
        {card}
      </div>
    </div>
  );
}
