export type AgentToolName =
  | "get_verified_memory"
  | "list_medications"
  | "get_today_doses"
  | "get_refill_forecast"
  | "get_health_trends"
  | "list_appointments"
  | "getMedicineSchedules"
  | "createMedicineSchedule"
  | "updateMedicineSchedule"
  | "deleteMedicineSchedule"
  | "draft_medication_schedule"
  | "confirm_medication_schedule"
  | "log_dose_taken"
  | "log_dose_skipped"
  | "record_measurement"
  | "share_with_caregiver";

export type ToolGuardrailDecision =
  | { allowed: true; requiresConfirmation: boolean }
  | { allowed: false; reason: string };

const READ_ONLY_TOOLS = new Set<AgentToolName>([
  "get_verified_memory",
  "list_medications",
  "get_today_doses",
  "get_refill_forecast",
  "get_health_trends",
  "list_appointments",
  "getMedicineSchedules",
]);

const KNOWN_TOOLS = new Set<AgentToolName>([
  ...READ_ONLY_TOOLS,
  "draft_medication_schedule",
  "confirm_medication_schedule",
  "log_dose_taken",
  "log_dose_skipped",
  "record_measurement",
  "share_with_caregiver",
  "createMedicineSchedule",
  "updateMedicineSchedule",
  "deleteMedicineSchedule",
]);

const PROHIBITED_TOOL_NAMES = new Set([
  "change_medication_dose",
  "create_prescription",
  "diagnose_condition",
  "notify_caregiver",
]);

/**
 * This is the application-side policy, not a prompt. Every future tool
 * executor must call it immediately before a side effect is performed.
 */
export function evaluateToolRequest(toolName: string): ToolGuardrailDecision {
  if (PROHIBITED_TOOL_NAMES.has(toolName)) {
    return {
      allowed: false,
      reason: "This medical action is not available to the assistant",
    };
  }

  if (!KNOWN_TOOLS.has(toolName as AgentToolName)) {
    return { allowed: false, reason: "Unknown agent tool" };
  }

  return {
    allowed: true,
    requiresConfirmation: !READ_ONLY_TOOLS.has(toolName as AgentToolName),
  };
}
