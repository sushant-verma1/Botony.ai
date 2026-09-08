import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api/api";
import Spinner from "./Spinner";
import { Button } from "./ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

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

/** Same two variants as Login: `embedded` returns the form alone, for when it
 *  is part of a composition rather than the page, and `onSwitch` replaces the
 *  "Sign in" link with a callback, for when the other form is going to take
 *  this one's place in situ rather than at another route. */
export default function Register({
  embedded = false,
  onSwitch,
}: {
  embedded?: boolean;
  onSwitch?: () => void;
}) {
  const [form, setForm] = useState<RegisterForm>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    age: "",
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);
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

  /* shadcn/ui's Field is the form, exactly as in Login — the label/control/
     error grouping and the invalid state are its job, so what is left here is
     which control belongs to which field. The two consents are the same Field
     laid out horizontally, so they inherit the same spacing rhythm as the
     inputs above them instead of being a special case. */
  const card = (
    <form onSubmit={handleSubmit} className="w-full">
      <FieldGroup className="gap-4">
        {/* One name, two boxes: the pair reads as a single row, which is also
            what keeps the form's height down when it is worn on the chest. */}
        <div className="flex gap-3">
          <Field data-invalid={!!errors.firstName || undefined}>
            <FieldLabel htmlFor="firstName">First name</FieldLabel>
            <Input
              id="firstName"
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              required
              aria-invalid={!!errors.firstName || undefined}
            />
            <FieldError>{errors.firstName}</FieldError>
          </Field>

          <Field data-invalid={!!errors.lastName || undefined}>
            <FieldLabel htmlFor="lastName">Last name</FieldLabel>
            <Input
              id="lastName"
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              required
              aria-invalid={!!errors.lastName || undefined}
            />
            <FieldError>{errors.lastName}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!errors.email || undefined}>
          <FieldLabel htmlFor="register-email">Email</FieldLabel>
          <Input
            id="register-email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
            aria-invalid={!!errors.email || undefined}
          />
          <FieldError>{errors.email}</FieldError>
        </Field>

        <div className="flex gap-3">
          <Field data-invalid={!!errors.password || undefined}>
            <FieldLabel htmlFor="register-password">Password</FieldLabel>
            {/* Same reveal as Login: inside the field, so the control is one
                row whatever width the field ends up at. */}
            <div className="relative">
              <Input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
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

          <Field data-invalid={!!errors.age || undefined} className="w-16 shrink-0">
            {/* The 13+ notice rides the label rather than sitting under the
                field as a FieldDescription: on the chest the form is already
                spending every unit it has, and a description is a whole extra
                row for three characters. */}
            <FieldLabel htmlFor="age">
              Age <span className="font-normal text-muted-foreground">13+</span>
            </FieldLabel>
            <Input
              id="age"
              name="age"
              type="number"
              min={13}
              value={form.age}
              onChange={handleChange}
              required
              aria-invalid={!!errors.age || undefined}
            />
            <FieldError>{errors.age}</FieldError>
          </Field>
        </div>

        {/* Both consents are required to submit — the button below stays
            disabled until they are given, and handleSubmit checks them again
            rather than trusting the button's state. */}
        <Field orientation="horizontal" className="hero__consent">
          <input
            id="agreedToTerms"
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
          />
          <FieldLabel htmlFor="agreedToTerms" className="font-normal">
            I agree to the{" "}
            <a
              href="/TERMS.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/PRIVACY.MD"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Privacy Policy
            </a>
          </FieldLabel>
        </Field>

        <Field orientation="horizontal" className="hero__consent">
          <input
            id="agreedNotMedicalAdvice"
            type="checkbox"
            checked={agreedNotMedicalAdvice}
            onChange={(e) => setAgreedNotMedicalAdvice(e.target.checked)}
          />
          <FieldLabel htmlFor="agreedNotMedicalAdvice" className="font-normal">
            I understand this is not a substitute for professional medical
            advice
          </FieldLabel>
        </Field>

        <Button
          type="submit"
          disabled={loading || !agreedToTerms || !agreedNotMedicalAdvice}
          className="w-full"
        >
          {loading && <Spinner />}
          {loading ? "Creating..." : "Create Account"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Have an account?{" "}
          {onSwitch ? (
            <button
              type="button"
              onClick={onSwitch}
              className="underline underline-offset-4"
            >
              Sign in
            </button>
          ) : (
            <Link to="/login" className="underline underline-offset-4">
              Sign in
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
        <h1 className="mb-6 text-2xl font-bold">Create Account</h1>
        {card}
      </div>
    </div>
  );
}
