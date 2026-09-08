// Verifies that prisma/migrations is a faithful, applyable representation of
// prisma/schema.prisma, against a real Postgres (a Neon staging branch).
//
//   STAGING_DATABASE_URL=...  npm run migrate:verify
//
// See Docs/migration-verification.md for the full procedure, including how to
// create and dispose of the Neon branch this runs against.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const stagingUrl = process.env.STAGING_DATABASE_URL;
const shadowUrl = process.env.STAGING_SHADOW_DATABASE_URL;

if (!stagingUrl) {
  console.error(
    "STAGING_DATABASE_URL is required. Never point this at production.",
  );
  process.exit(1);
}

if (/prod/i.test(stagingUrl)) {
  console.error("Refusing to run: STAGING_DATABASE_URL looks like production.");
  process.exit(1);
}

function run(label: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  console.log(`\n── ${label}\n   npx prisma ${args.join(" ")}`);
  const result = spawnSync("npx", ["prisma", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label}`);
}

// 1. Apply every migration from scratch, in order, exactly as production
//    would. This is the step that catches SQL that only works against a
//    database that already has the change.
run("migrate deploy against staging", ["migrate", "deploy"], {
  DATABASE_URL: stagingUrl,
});

// 2. Confirm the recorded migration history matches what is on disk and
//    nothing was applied out of band.
run("migrate status", ["migrate", "status"], { DATABASE_URL: stagingUrl });

// 3. Drift check: after deploying, the database must be exactly what
//    schema.prisma describes. A non-empty diff means a migration is missing.
//    --exit-code makes a non-empty diff a failure.
run(
  "schema drift check (database vs schema.prisma)",
  [
    "migrate",
    "diff",
    // Prisma 7 removed --from-url; the source database is now taken from
    // prisma.config.ts, which reads DATABASE_URL — set below.
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--exit-code",
  ],
  { DATABASE_URL: stagingUrl },
);

// 4. Shadow-database check: replaying migrations into an empty database must
//    produce the same schema as schema.prisma. Optional, because it needs a
//    second empty database.
if (shadowUrl) {
  run(
    "migration replay check (migrations vs schema.prisma)",
    [
      "migrate",
      "diff",
      "--from-migrations",
      "prisma/migrations",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    // Prisma 7 removed --shadow-database-url too; prisma.config.ts reads
    // SHADOW_DATABASE_URL for it.
    { DATABASE_URL: stagingUrl, SHADOW_DATABASE_URL: shadowUrl },
  );
} else {
  console.log(
    "\n⚠ STAGING_SHADOW_DATABASE_URL not set — skipped the migrations-replay check.",
  );
}

console.log("\nAll migration checks passed.");
