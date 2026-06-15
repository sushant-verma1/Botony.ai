import "dotenv/config";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const connectionString = getEnv("DATABASE_URL");
const accessTokenSecret = getEnv("ACCESS_TOKEN_SECRET");
const refreshTokenSecret = getEnv("REFRESH_TOKEN_SECRET");
const claudeKey = getEnv("ANTHROPIC_API_KEY");

export { connectionString, accessTokenSecret, refreshTokenSecret, claudeKey };
