import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { careCircleAPI, type CareAccess, type CarePermission } from "../../services/api/careCircleApi";
import Spinner from "../Spinner";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

const scopes: Array<{ value: CarePermission; label: string }> = [
  { value: "VIEW_MEDICATIONS", label: "Medicines" },
  { value: "VIEW_MEDICATION_SCHEDULES", label: "Medicine schedules" },
  { value: "VIEW_HEALTH_MEASUREMENTS", label: "Health measurements" },
  { value: "VIEW_APPOINTMENTS", label: "Appointments" },
  { value: "VIEW_REPORT_SUMMARIES", label: "Report summaries" },
];

function displayPerson(person: CareAccess["caregiver"] | CareAccess["recipient"]) {
  if (!person) return "Unknown person";
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

export default function CareCircleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [asRecipient, setAsRecipient] = useState<CareAccess[]>([]);
  const [asCaregiver, setAsCaregiver] = useState<CareAccess[]>([]);
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<CarePermission[]>(["VIEW_MEDICATIONS", "VIEW_APPOINTMENTS"]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await careCircleAPI.list();
      setAsRecipient(data.asRecipient);
      setAsCaregiver(data.asCaregiver);
    } catch {
      setError("Could not load care-circle access.");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open]);
  const messageFrom = (unknownError: unknown, fallback: string) => axios.isAxiosError(unknownError) ? unknownError.response?.data?.message || fallback : fallback;
  const toggle = (permission: CarePermission) => setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);

  const invite: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!email.trim() || permissions.length === 0) return;
    setSaving(true); setError(null);
    try {
      await careCircleAPI.invite(email.trim(), permissions);
      setEmail("");
      toast.success("Care invitation created");
      await load();
    } catch (unknownError) { setError(messageFrom(unknownError, "Could not create this invitation.")); }
    finally { setSaving(false); }
  };

  const respond = async (id: string, accept: boolean) => {
    setSaving(true); setError(null);
    try { await careCircleAPI.respond(id, accept); toast.success(accept ? "Care invitation accepted" : "Care invitation declined"); await load(); }
    catch (unknownError) { setError(messageFrom(unknownError, "Could not update this invitation.")); }
    finally { setSaving(false); }
  };

  const revoke = async (id: string) => {
    setSaving(true); setError(null);
    try { await careCircleAPI.revoke(id); toast.success("Care access revoked"); await load(); }
    catch (unknownError) { setError(messageFrom(unknownError, "Could not revoke access.")); }
    finally { setSaving(false); }
  };

  const setMedicationReminders = async (access: CareAccess, enabled: boolean) => {
    setSaving(true); setError(null);
    try {
      await careCircleAPI.setMedicationReminderNotifications(access.id, enabled);
      toast.success(enabled ? "Caregiver medication reminders enabled" : "Caregiver medication reminders disabled");
      await load();
    } catch (unknownError) { setError(messageFrom(unknownError, "Could not update reminder sharing.")); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90svh] overflow-y-auto p-5 sm:max-w-2xl">
      <DialogHeader><DialogTitle className="text-[17px] tracking-[-0.012em]">Care circle</DialogTitle><DialogDescription>Invite a family caregiver with only the records you choose. Nothing is shared until they accept, and you can revoke access at any time.</DialogDescription></DialogHeader>
      <form onSubmit={invite} className="mt-4 rounded-xl border border-border p-4">
        <FieldGroup className="gap-3"><Field><FieldLabel htmlFor="caregiver-email">Caregiver email</FieldLabel><Input id="caregiver-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field></FieldGroup>
        <fieldset className="mt-3"><legend className="text-sm font-medium">Share only</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{scopes.map((scope) => <label className="flex items-center gap-2 text-sm" key={scope.value}><input type="checkbox" checked={permissions.includes(scope.value)} onChange={() => toggle(scope.value)} />{scope.label}</label>)}</div></fieldset>
        <div className="mt-4 flex justify-end"><Button type="submit" disabled={saving || permissions.length === 0}>{saving && <Spinner className="size-3.5" />} Invite caregiver</Button></div>
      </form>
      {error && <FieldError className="mt-3">{error}</FieldError>}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <section><p className="mb-2 text-sm font-medium">People you invited</p>{loading ? <Spinner className="size-4" /> : <ul className="space-y-2">{asRecipient.map((access) => <li className="rounded-lg border border-border p-3 text-sm" key={access.id}><p>{displayPerson(access.caregiver)}</p><p className="mt-1 text-xs text-muted-foreground">{access.status.toLowerCase()} · {access.permissions.length} selected records</p>{access.status === "ACTIVE" && access.permissions.includes("VIEW_MEDICATIONS") && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={access.medicationReminderNotifications} disabled={saving} onChange={(event) => void setMedicationReminders(access, event.target.checked)} />Send in-app medication reminders</label>}{(access.status === "ACTIVE" || access.status === "PENDING") && <Button variant="ghost" className="mt-2 h-7 px-2 text-xs" disabled={saving} onClick={() => void revoke(access.id)}>Revoke</Button>}</li>)}{asRecipient.length === 0 && <li className="text-sm text-muted-foreground">No invitations yet.</li>}</ul>}</section>
        <section><p className="mb-2 text-sm font-medium">Invitations for you</p>{loading ? <Spinner className="size-4" /> : <ul className="space-y-2">{asCaregiver.map((access) => <li className="rounded-lg border border-border p-3 text-sm" key={access.id}><p>{displayPerson(access.recipient)}</p><p className="mt-1 text-xs text-muted-foreground">{access.status.toLowerCase()} · {access.permissions.length} selected records</p>{access.status === "PENDING" && <div className="mt-2 flex gap-2"><Button className="h-7 px-2 text-xs" disabled={saving} onClick={() => void respond(access.id, true)}>Accept</Button><Button variant="ghost" className="h-7 px-2 text-xs" disabled={saving} onClick={() => void respond(access.id, false)}>Decline</Button></div>}{access.status === "ACTIVE" && <Button variant="ghost" className="mt-2 h-7 px-2 text-xs" disabled={saving} onClick={() => void revoke(access.id)}>Leave care circle</Button>}</li>)}{asCaregiver.length === 0 && <li className="text-sm text-muted-foreground">No invitations for you.</li>}</ul>}</section>
      </div>
      <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
