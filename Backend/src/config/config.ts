import "dotenv/config";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const connectionString = getEnv("DATABASE_URL");
const jwtSecret = getEnv("JWT_SECRET");

export { connectionString, jwtSecret };
