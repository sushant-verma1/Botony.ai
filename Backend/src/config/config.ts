import "dotenv/config";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

function getIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const connectionString = getEnv("DATABASE_URL");
const accessTokenSecret = getEnv("ACCESS_TOKEN_SECRET");
const refreshTokenSecret = getEnv("REFRESH_TOKEN_SECRET");

const xaiApiKey = getEnv("XAI_API_KEY");
const xaiModel = getOptionalEnv("XAI_MODEL", "grok-4.6");

const geminiApiKey = getEnv("GEMINI_API_KEY");
const geminiModel = getOptionalEnv("GEMINI_MODEL", "gemini-3.6-flash");

const cloudinaryCloudName = getEnv("CLOUDINARY_CLOUD_NAME");
const cloudinaryApiKey = getEnv("CLOUDINARY_API_KEY");
const cloudinaryApiSecret = getEnv("CLOUDINARY_API_SECRET");

const isProduction = (process.env.NODE_ENV || "development") === "production";

// ClamAV (clamd) — uploads are streamed to it over TCP for scanning.
// If CLAMAV_HOST is unset there is no scanner, and ALLOW_UNSCANNED_UPLOADS
// decides whether that is tolerated. It defaults to false in production so a
// missing scanner fails closed rather than silently accepting every file.
const clamavHost = process.env.CLAMAV_HOST || "";
const clamavPort = getIntEnv("CLAMAV_PORT", 3310);
const clamavTimeoutMs = getIntEnv("CLAMAV_TIMEOUT_MS", 20_000);
const allowUnscannedUploads = process.env.ALLOW_UNSCANNED_UPLOADS
  ? process.env.ALLOW_UNSCANNED_UPLOADS === "true"
  : !isProduction;

// Background sweep of abandoned PENDING uploads. Set to 0 to disable the
// in-process timer when cleanup runs from an external cron instead.
const attachmentCleanupIntervalMs = getIntEnv(
  "ATTACHMENT_CLEANUP_INTERVAL_MS",
  15 * 60 * 1000,
);

// Optional: the app must keep working with no Sentry configured at all.
const sentryDsn = process.env.SENTRY_DSN || "";
const sentryEnvironment = getOptionalEnv(
  "SENTRY_ENVIRONMENT",
  process.env.NODE_ENV || "development",
);

export {
  connectionString,
  accessTokenSecret,
  refreshTokenSecret,
  xaiApiKey,
  xaiModel,
  geminiApiKey,
  geminiModel,
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
  clamavHost,
  clamavPort,
  clamavTimeoutMs,
  allowUnscannedUploads,
  attachmentCleanupIntervalMs,
  isProduction,
  sentryDsn,
  sentryEnvironment,
  getOptionalEnv,
};
