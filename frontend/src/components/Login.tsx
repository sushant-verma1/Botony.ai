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

/** The card alone — no page framing. It is always rendered onto the
 *  character's chest, by the /login route inside AuthScene (see
 *  components/intro/AuthScene.tsx), which is the page. */
export default function Login() {
  const [errors, setErrors] = useState<FormErrors>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  /** What the submit button waits for: the two fields having something in
   *  them. Only presence — whether the email is an address and the password
   *  long enough is validate()'s job, on submit, where a message can be shown
   *  next to the field that is wrong. A greyed button is not a validator. */
  const incomplete = !email.trim() || !password;

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
  return (
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

        {/* data-secret: the scene shuts the character's eyes while this
            field is hovered or focused (see intro/AuthScene). */}
        <Field data-invalid={!!errors.password || undefined} data-secret>
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

        <Button
          type="submit"
          disabled={loading || incomplete}
          className="w-full"
        >
          {loading && <Spinner />}
          {loading ? "Signing in..." : "Sign In"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          No account?{" "}
          <Link to="/register" className="underline underline-offset-4">
            Register
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
