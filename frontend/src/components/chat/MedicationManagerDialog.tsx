import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { medicationAPI, type Medication } from "../../services/api/medicationApi";
import Spinner from "../Spinner";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";

export default function MedicationManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [name, setName] = useState("");
  const [strength, setStrength] = useState("");
  const [form, setForm] = useState("");
  const [inventory, setInventory] = useState<Record<string, { quantity: string; refillAt: string }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await medicationAPI.list();
      setMedications(data.medications.filter((item) => item.status === "ACTIVE"));
      setInventory(Object.fromEntries(data.medications.map((item) => [item.id, { quantity: item.quantityOnHand?.toString() ?? "", refillAt: item.refillAt?.toString() ?? "" }])));
    } catch { setError("Could not load medicines."); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) void load(); }, [open]);
  const messageFrom = (unknownError: unknown, fallback: string) => axios.isAxiosError(unknownError) ? unknownError.response?.data?.message || fallback : fallback;

  const create: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      await medicationAPI.create({ name: name.trim(), ...(strength.trim() ? { strength: strength.trim() } : {}), ...(form.trim() ? { form: form.trim() } : {}) });
      setName(""); setStrength(""); setForm("");
      toast.success("Medicine added"); await load();
    } catch (unknownError) { setError(messageFrom(unknownError, "Could not add this medicine.")); }
    finally { setSaving(false); }
  };

  const saveInventory = async (medication: Medication) => {
    const values = inventory[medication.id];
    const quantity = Number(values?.quantity);
    const threshold = values?.refillAt.trim() ? Number(values.refillAt) : undefined;
    if (!Number.isInteger(quantity) || quantity < 0 || (threshold !== undefined && (!Number.isInteger(threshold) || threshold < 0))) {
      setError("Supply and refill level must be whole numbers of zero or more."); return;
    }
    setSaving(true); setError(null);
    try {
      await medicationAPI.updateInventory(medication.id, quantity, threshold);
      toast.success("Medication supply updated"); await load();
    } catch (unknownError) { setError(messageFrom(unknownError, "Could not update supply.")); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90svh] overflow-y-auto p-5 sm:max-w-2xl">
      <DialogHeader><DialogTitle className="text-[17px] tracking-[-0.012em]">Medicines</DialogTitle><DialogDescription>Add medicines from your prescription or label. Botony records what you enter and does not prescribe or change doses.</DialogDescription></DialogHeader>
      <form onSubmit={create} className="mt-4 rounded-xl border border-border p-4"><p className="mb-3 text-sm font-medium">Add medicine</p><FieldGroup className="grid gap-3 sm:grid-cols-3"><Field><FieldLabel htmlFor="med-name">Name</FieldLabel><Input id="med-name" value={name} onChange={(event) => setName(event.target.value)} required /></Field><Field><FieldLabel htmlFor="med-strength">Strength</FieldLabel><Input id="med-strength" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="Optional" /></Field><Field><FieldLabel htmlFor="med-form">Form</FieldLabel><Input id="med-form" value={form} onChange={(event) => setForm(event.target.value)} placeholder="Tablet, capsule…" /></Field></FieldGroup><div className="mt-3 flex justify-end"><Button type="submit" disabled={saving}>{saving && <Spinner className="size-3.5" />} Add medicine</Button></div></form>
      {error && <FieldError className="mt-3">{error}</FieldError>}
      <section className="mt-5"><p className="mb-2 text-sm font-medium">Active medicines</p>{loading ? <Spinner className="size-4" /> : <ul className="space-y-3">{medications.map((medication) => <li key={medication.id} className="rounded-xl border border-border p-4"><p className="text-sm font-medium">{medication.name}{medication.strength ? ` · ${medication.strength}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{medication.schedules.length ? `${medication.schedules.length} active schedule${medication.schedules.length === 1 ? "" : "s"}` : "No reminder schedule yet"}</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label={`${medication.name} supply on hand`} type="number" min="0" step="1" placeholder="Supply on hand" value={inventory[medication.id]?.quantity ?? ""} onChange={(event) => setInventory((current) => ({ ...current, [medication.id]: { ...current[medication.id], quantity: event.target.value } }))} /><Input aria-label={`${medication.name} refill level`} type="number" min="0" step="1" placeholder="Refill alert level" value={inventory[medication.id]?.refillAt ?? ""} onChange={(event) => setInventory((current) => ({ ...current, [medication.id]: { ...current[medication.id], refillAt: event.target.value } }))} /><Button variant="secondary" disabled={saving} onClick={() => void saveInventory(medication)}>Save supply</Button></div></li>)}{medications.length === 0 && <li className="text-sm text-muted-foreground">No active medicines yet.</li>}</ul>}</section>
      <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
