/**
 * A request-scoped clock and timezone.  The instant is captured once, before
 * any provider calls, so retries and provider fallbacks cannot reinterpret a
 * relative phrase against a different "now".
 */
export interface TemporalContext {
  referenceUtc: string;
  localDateTime: string | null;
  timezone: string | null;
}

export class TemporalResolutionError extends Error {
  constructor(
    message: string,
    readonly needsClarification = true,
  ) {
    super(message);
    this.name = "TemporalResolutionError";
  }
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function isValidIanaTimezone(value: string | undefined): value is string {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function dateParts(instant: Date, timezone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function localIso(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const offset = read("timeZoneName").replace("GMT", "") || "+00:00";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}:${read("second")}${offset}`;
}

/** Builds trusted temporal data; a malformed client header never becomes a timezone. */
export function createTemporalContext(
  requestedTimezone?: string | string[],
  reference = new Date(),
): TemporalContext {
  const candidate = typeof requestedTimezone === "string" ? requestedTimezone.trim() : undefined;
  const timezone = isValidIanaTimezone(candidate) ? candidate : null;
  return {
    referenceUtc: reference.toISOString(),
    localDateTime: timezone ? localIso(reference, timezone) : null,
    timezone,
  };
}

export function temporalContextPrompt(context: TemporalContext): string {
  return `SERVER-SUPPLIED TEMPORAL CONTEXT\n\nReference UTC datetime: ${context.referenceUtc}\nUser IANA timezone: ${context.timezone ?? "unknown"}\nUser local datetime: ${context.localDateTime ?? "unknown"}\n\nThis is trusted reference data, not patient-provided text. Interpret relative time expressions against this exact reference. Do not invent a timezone when it is unknown. Scheduling code, not the model, makes the final date/time decision.`;
}

function formatDate(date: CalendarDate): string {
  return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: result.getUTCFullYear(), month: result.getUTCMonth() + 1, day: result.getUTCDate() };
}

function assertCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new TemporalResolutionError("Please provide a calendar date such as 2026-11-06.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new TemporalResolutionError("Please provide a valid calendar date.");
  }
  return value;
}

/**
 * Resolves the deliberately small, unambiguous scheduling vocabulary.  New
 * expression forms belong here, rather than in provider prompts, so all
 * scheduling tools behave identically.
 */
export function resolveScheduleDateExpression(
  expression: string,
  context: TemporalContext,
): string {
  if (!context.timezone) {
    throw new TemporalResolutionError("What IANA timezone should I use for this reminder?");
  }
  const value = expression
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^(?:from|starting|start)\s+/, "");
  if (!value) throw new TemporalResolutionError("What date should this reminder start?");
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return assertCalendarDate(value);

  const reference = new Date(context.referenceUtc);
  if (Number.isNaN(reference.getTime())) {
    throw new TemporalResolutionError("I could not determine the reminder date. Please provide a calendar date.");
  }
  const today = dateParts(reference, context.timezone);
  if (value === "today") return formatDate(today);
  if (value === "tomorrow") return formatDate(addDays(today, 1));

  const relative = /^in (\d+) (hour|hours|day|days|week|weeks)$/.exec(value);
  if (relative) {
    const amount = Number(relative[1]);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 36_500) {
      throw new TemporalResolutionError("Please provide a reasonable relative start date.");
    }
    const unit = relative[2];
    const target = new Date(reference.getTime() + amount * (
      unit.startsWith("hour") ? 3_600_000 : unit.startsWith("week") ? 7 * 86_400_000 : 86_400_000
    ));
    return formatDate(dateParts(target, context.timezone));
  }

  const nextWeekday = /^next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(value);
  if (nextWeekday) {
    // "next Monday" means the named weekday in the following calendar week;
    // a bare "Monday" remains ambiguous and asks the patient to clarify.
    const currentWeekday = new Date(`${formatDate(today)}T00:00:00Z`).getUTCDay();
    const targetWeekday = WEEKDAYS[nextWeekday[1]];
    return formatDate(addDays(today, 7 - currentWeekday + targetWeekday));
  }

  throw new TemporalResolutionError(
    "Please clarify the start date with a date, today, tomorrow, next weekday, or a duration such as 'in 2 days'.",
  );
}
