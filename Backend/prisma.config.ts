import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // Only used by `prisma migrate diff --from-migrations` (npm run
    // migrate:verify). Prisma 7 removed the --shadow-database-url flag, so the
    // replay check can only be configured here. Unset in normal operation.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});