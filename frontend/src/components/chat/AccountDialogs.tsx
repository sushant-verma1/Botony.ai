import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { LIMITS } from "../landing/limits";
import Spinner from "../Spinner";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import type { ChatPrefs } from "./prefs";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* Every one of these is a side errand off a conversation you are in the
   middle of — a name, a preference, a reminder of what this thing will not
   do. None of them is worth losing your place in the transcript for, which is
   the whole argument for a modal and the reason the chat has no settings
   route. */

/* ---- profile ----------------------------------------------------------- */

/** The backend column is firstName and Joi bounds it at 3–20 characters;
 *  repeated here so the message lands under the field instead of arriving as
 *  a 400 with no home. */
const NAME_MIN = 3;
const NAME_MAX = 20;

export function ProfileDialog({ open, onOpenChange }: DialogProps) {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reopening after a cancel should show what is stored, not what was
  // half-typed last time.
  useEffect(() => {
    if (open) {
      setName(user?.name ?? "");
      setError(null);
    }
  }, [open, user?.name]);

  const trimmed = name.trim();
  const unchanged = trimmed === (user?.name ?? "");

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();

    if (trimmed.length < NAME_MIN) {
      setError(`Use at least ${NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setError(`Keep it to ${NAME_MAX} characters or fewer.`);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await updateProfile(trimmed);
      toast.success("Profile updated");
      onOpenChange(false);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || "Could not save your profile"
        : "Could not save your profile";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-[-0.012em]">
            Profile
          </DialogTitle>
          <DialogDescription>
            How Botony addresses you in this account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} id="profile-form">
          <FieldGroup className="gap-4">
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="profile-name">Name</FieldLabel>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX}
                autoComplete="given-name"
                aria-invalid={!!error || undefined}
              />
              <FieldError>{error}</FieldError>
            </Field>

            {/* Shown, not editable: the address is the login, and moving it
                is an auth change rather than a profile one. */}
            <Field>
              <FieldLabel htmlFor="profile-email">Email</FieldLabel>
              <Input
                id="profile-email"
                value={user?.email ?? ""}
                readOnly
                disabled
              />
              <p className="text-xs text-muted-foreground">
                This is the address you sign in with, and it cannot be changed
                here.
              </p>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter className="-mx-5 -mb-5 gap-2 p-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-9 rounded-full px-4"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="profile-form"
            disabled={saving || unchanged || !trimmed}
            className="h-9 rounded-full px-4"
          >
            {saving && <Spinner className="size-3.5" />}
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- settings ---------------------------------------------------------- */

/** Native radios behind a segmented face: the browser already gives a
 *  radiogroup its arrow keys, its focus behaviour and its announcement, and
 *  none of that is worth rewriting for a two-option control. */
function Choice<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex rounded-full bg-muted p-0.5 ring-1 ring-border">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="block rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap text-muted-foreground transition-colors peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-[inset_0_0_0_1px_var(--line)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 border-b border-border py-5 first:border-t sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>

        <p className="mt-1 max-w-[42ch] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="shrink-0">
        {children}
      </div>
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  prefs,
  onChange,
}: DialogProps & {
  prefs: ChatPrefs;
  onChange: (next: Partial<ChatPrefs>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-[-0.012em]">
            Settings
          </DialogTitle>
          <DialogDescription>
            How the composer and the transcript behave. Saved on this device.
          </DialogDescription>
        </DialogHeader>

        {/* A rule per setting, no cards — the same list the landing page uses
            for its limits, doing the same job here. Applied as you pick, so
            there is nothing to save and nothing to discard. */}
        <div>
          <Row
            title="Sending a message"
            description="Whichever you pick, the other combination inserts a line break instead."
          >
            <Choice
              name="enter-sends"
              label="Sending a message"
              value={prefs.enterSends ? "enter" : "modifier"}
              options={[
                { value: "enter", label: "Enter" },
                { value: "modifier", label: "Ctrl + Enter" },
              ]}
              onChange={(v) => onChange({ enterSends: v === "enter" })}
            />
          </Row>

          <Row
            title="Transcript text size"
            description="Affects the conversation only, not the rest of the interface."
          >
            <Choice
              name="text-size"
              label="Transcript text size"
              value={prefs.textSize}
              options={[
                { value: "default", label: "Default" },
                { value: "large", label: "Large" },
              ]}
              onChange={(v) => onChange({ textSize: v })}
            />
          </Row>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---- safety ------------------------------------------------------------ */

export function SafetyDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[19px] tracking-[-0.018em]">
            The honest boundaries.
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            A medical assistant earns trust by being precise about what it will
            not do. These are ours, stated plainly rather than buried in terms.
          </DialogDescription>
        </DialogHeader>

        {/* The landing page's own list, imported rather than retyped. */}
        <ul className="m-0 list-none p-0">
          {LIMITS.map((limit) => (
            <li
              key={limit}
              className="border-b border-border py-3 text-[15px] tracking-[-0.008em] first:border-t"
            >
              {limit}
            </li>
          ))}
        </ul>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          If you think you are having a medical emergency, contact your local
          emergency number now rather than typing it here.
        </p>
      </DialogContent>
    </Dialog>
  );
}
