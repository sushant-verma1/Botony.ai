import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  healthAPI,
  type HealthAppointment,
  type HealthMeasurement,
  type HealthMeasurementType,
} from "../../services/api/healthApi";
import Spinner from "../Spinner";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";

interface HealthTrackerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeLabels: Record<HealthMeasurementType, string> = {
  BLOOD_PRESSURE: "Blood pressure",
  BLOOD_GLUCOSE: "Blood glucose",
  WEIGHT: "Weight",
  HEART_RATE: "Heart rate",
  TEMPERATURE: "Temperature",
  CUSTOM: "Custom",
};

function localDateTimeNow() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function HealthTrackerDialog({ open, onOpenChange }: HealthTrackerDialogProps) {
  const [measurements, setMeasurements] = useState<HealthMeasurement[]>([]);
  const [appointments, setAppointments] = useState<HealthAppointment[]>([]);
  const [type, setType] = useState<HealthMeasurementType>("BLOOD_PRESSURE");
  const [value, setValue] = useState("");
  const [secondaryValue, setSecondaryValue] = useState("");
  const [unit, setUnit] = useState("mmHg");
  const [label, setLabel] = useState("");
  const [measuredAt, setMeasuredAt] = useState(localDateTimeNow);
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [appointmentAt, setAppointmentAt] = useState("");
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [measurementResult, appointmentResult] = await Promise.all([
        healthAPI.listMeasurements(),
        healthAPI.listAppointments(),
      ]);
      setMeasurements(measurementResult.data.measurements);
      setAppointments(appointmentResult.data.appointments);
    } catch {
      setError("Could not load your health records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  useEffect(() => {
    if (type === "BLOOD_PRESSURE") setUnit("mmHg");
    else if (type === "HEART_RATE") setUnit("bpm");
    else if (type === "WEIGHT") setUnit("kg");
    else if (type === "TEMPERATURE") setUnit("°C");
    else if (type === "BLOOD_GLUCOSE") setUnit("mg/dL");
  }, [type]);

  const errorMessage = (unknownError: unknown, fallback: string) =>
    axios.isAxiosError(unknownError) ? unknownError.response?.data?.message || fallback : fallback;

  const submitMeasurement: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError(null);
    const number = Number(value);
    const second = secondaryValue.trim() ? Number(secondaryValue) : undefined;
    if (!Number.isFinite(number) || (secondaryValue.trim() && !Number.isFinite(second))) {
      setError("Enter valid numeric values.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await healthAPI.createMeasurement({
        type,
        value: number,
        ...(second !== undefined ? { secondaryValue: second } : {}),
        unit,
        measuredAt: new Date(measuredAt).toISOString(),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setMeasurements((current) => [data.measurement, ...current]);
      setValue("");
      setSecondaryValue("");
      setLabel("");
      setMeasuredAt(localDateTimeNow());
      toast.success("Measurement saved");
    } catch (unknownError) {
      setError(errorMessage(unknownError, "Could not save this measurement."));
    } finally {
      setSaving(false);
    }
  };

  const submitAppointment: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError(null);
    if (!appointmentTitle.trim() || !appointmentAt) return;
    setSaving(true);
    try {
      const { data } = await healthAPI.createAppointment({
        title: appointmentTitle.trim(),
        startsAt: new Date(appointmentAt).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        ...(provider.trim() ? { provider: provider.trim() } : {}),
      });
      setAppointments((current) => [...current, data.appointment].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setAppointmentTitle("");
      setAppointmentAt("");
      setProvider("");
      toast.success("Appointment saved");
    } catch (unknownError) {
      setError(errorMessage(unknownError, "Could not save this appointment."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] gap-5 overflow-y-auto p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-[-0.012em]">Health tracker</DialogTitle>
          <DialogDescription>Keep your readings and appointments in one private place. Recorded values are not diagnoses.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submitMeasurement} className="rounded-xl border border-border p-4">
          <p className="mb-3 text-sm font-medium">Add a measurement</p>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="health-type">Type</FieldLabel>
              <select id="health-type" value={type} onChange={(event) => setType(event.target.value as HealthMeasurementType)} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                {Object.entries(typeLabels).map(([key, display]) => <option value={key} key={key}>{display}</option>)}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="health-unit">Unit</FieldLabel>
              <Input id="health-unit" value={unit} onChange={(event) => setUnit(event.target.value)} required />
            </Field>
            {type === "CUSTOM" && <Field><FieldLabel htmlFor="health-label">Label</FieldLabel><Input id="health-label" value={label} onChange={(event) => setLabel(event.target.value)} required /></Field>}
            <Field>
              <FieldLabel htmlFor="health-value">{type === "BLOOD_PRESSURE" ? "Systolic" : "Value"}</FieldLabel>
              <Input id="health-value" type="number" step="any" min="0" value={value} onChange={(event) => setValue(event.target.value)} required />
            </Field>
            {type === "BLOOD_PRESSURE" && <Field><FieldLabel htmlFor="health-secondary">Diastolic</FieldLabel><Input id="health-secondary" type="number" step="any" min="0" value={secondaryValue} onChange={(event) => setSecondaryValue(event.target.value)} required /></Field>}
            <Field>
              <FieldLabel htmlFor="health-time">When measured</FieldLabel>
              <Input id="health-time" type="datetime-local" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} required />
            </Field>
          </FieldGroup>
          <div className="mt-3 flex justify-end"><Button type="submit" disabled={saving}>{saving && <Spinner className="size-3.5" />} Save reading</Button></div>
        </form>

        <form onSubmit={submitAppointment} className="rounded-xl border border-border p-4">
          <p className="mb-3 text-sm font-medium">Add an appointment</p>
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="appointment-title">Title</FieldLabel><Input id="appointment-title" value={appointmentTitle} onChange={(event) => setAppointmentTitle(event.target.value)} required /></Field>
            <Field><FieldLabel htmlFor="appointment-time">Starts</FieldLabel><Input id="appointment-time" type="datetime-local" value={appointmentAt} onChange={(event) => setAppointmentAt(event.target.value)} required /></Field>
            <Field><FieldLabel htmlFor="appointment-provider">Provider (optional)</FieldLabel><Input id="appointment-provider" value={provider} onChange={(event) => setProvider(event.target.value)} /></Field>
          </FieldGroup>
          <div className="mt-3 flex justify-end"><Button type="submit" disabled={saving}>{saving && <Spinner className="size-3.5" />} Save appointment</Button></div>
        </form>

        {error && <FieldError>{error}</FieldError>}
        <div className="grid gap-4 sm:grid-cols-2">
          <section><p className="mb-2 text-sm font-medium">Recent readings</p>{loading ? <Spinner className="size-4" /> : <ul className="space-y-2 text-sm">{measurements.slice(0, 5).map((item) => <li key={item.id} className="rounded-lg bg-muted/50 px-3 py-2">{typeLabels[item.type]}: {item.value}{item.secondaryValue ? `/${item.secondaryValue}` : ""} {item.unit}</li>)}{measurements.length === 0 && <li className="text-muted-foreground">No readings yet.</li>}</ul>}</section>
          <section><p className="mb-2 text-sm font-medium">Appointments</p>{loading ? <Spinner className="size-4" /> : <ul className="space-y-2 text-sm">{appointments.slice(0, 5).map((item) => <li key={item.id} className="rounded-lg bg-muted/50 px-3 py-2">{item.title}<span className="block text-xs text-muted-foreground">{new Date(item.startsAt).toLocaleString()}</span></li>)}{appointments.length === 0 && <li className="text-muted-foreground">No appointments yet.</li>}</ul>}</section>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
