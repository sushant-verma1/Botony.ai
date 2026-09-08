// Runs EXPLAIN (ANALYZE) against the queries the app actually issues and
// asserts that each index added for them is really used.
//
//   EXPLAIN_DATABASE_URL=<staging url> npm run db:explain
//   EXPLAIN_DATABASE_URL=<staging url> npm run db:explain -- --no-seed
//
// By default it seeds representative synthetic data inside a transaction that
// is always rolled back, because Postgres correctly prefers a sequential scan
// on a near-empty table — verifying index usage against an empty staging
// database would prove nothing. Pass --no-seed to measure real data instead.
import "dotenv/config";
import { Client } from "pg";

const connectionString =
  process.env.EXPLAIN_DATABASE_URL || process.env.STAGING_DATABASE_URL;

if (!connectionString) {
  console.error("EXPLAIN_DATABASE_URL (or STAGING_DATABASE_URL) is required.");
  process.exit(1);
}
if (/prod/i.test(connectionString)) {
  console.error("Refusing to run: that connection string looks like production.");
  process.exit(1);
}

const seed = !process.argv.includes("--no-seed");

interface Check {
  name: string;
  /** The application code this query is taken from. */
  source: string;
  sql: string;
  values: unknown[];
  expectedIndex: string;
  relation: string;
}

const checks: Check[] = [
  {
    name: "list a user's conversations, newest first",
    source: "chat.controller.ts → listConversationsController",
    sql: `SELECT id, title, status, "createdAt", "updatedAt" FROM "Conversation"
          WHERE "userId" = $1 ORDER BY "updatedAt" DESC LIMIT 50`,
    values: ["seed-u-7"],
    expectedIndex: "Conversation_userId_updatedAt_idx",
    relation: "Conversation",
  },
  {
    name: "paginate a conversation's history",
    source:
      "chat.controller.ts → getHistoryController / messageController previousMessages",
    sql: `SELECT id, content, role, "createdAt" FROM "Message"
          WHERE "conversationId" = $1 ORDER BY "createdAt" DESC LIMIT 31`,
    values: ["seed-c-11"],
    expectedIndex: "Message_conversationId_createdAt_idx",
    relation: "Message",
  },
  {
    name: "cascade lookup of a user's messages (User delete)",
    source: "Prisma onDelete: Cascade on Message.userId",
    sql: `SELECT id FROM "Message" WHERE "userId" = $1`,
    values: ["seed-u-7"],
    expectedIndex: "Message_userId_idx",
    relation: "Message",
  },
  {
    name: "cascade lookup of a user's attachments (User delete)",
    source: "Prisma onDelete: Cascade on Attachment.userId",
    sql: `SELECT id FROM "Attachment" WHERE "userId" = $1`,
    values: ["seed-u-7"],
    expectedIndex: "Attachment_userId_createdAt_idx",
    relation: "Attachment",
  },
  {
    name: "load a message's attachments",
    source: "Prisma Message.attachments relation / Message delete cascade",
    sql: `SELECT id FROM "Attachment" WHERE "messageId" = $1`,
    values: ["seed-m-31"],
    expectedIndex: "Attachment_messageId_idx",
    relation: "Attachment",
  },
  {
    name: "sweep abandoned PENDING uploads",
    source: "attachment.service.ts → sweepAbandonedAttachments",
    sql: `SELECT id FROM "Attachment"
          WHERE status = 'PENDING' AND "createdAt" < $1 LIMIT 200`,
    values: [new Date(Date.now() - 60 * 60 * 1000)],
    expectedIndex: "Attachment_status_createdAt_idx",
    relation: "Attachment",
  },
];

const SEED_SQL = `
INSERT INTO "User" (id, email, password, age, "createdAt", "updatedAt")
SELECT 'seed-u-'||g, 'seed'||g||'@example.invalid', 'x', 30, now(), now()
FROM generate_series(1, 200) g;

INSERT INTO "Conversation" (id, title, status, "userId", "createdAt", "updatedAt")
SELECT 'seed-c-'||g, 'seed', 'ongoing', 'seed-u-'||((g % 200) + 1),
       now(), now() - (g || ' seconds')::interval
FROM generate_series(1, 5000) g;

INSERT INTO "Message" (id, content, role, "conversationId", "userId", "createdAt")
SELECT 'seed-m-'||g, 'seed content',
       (CASE WHEN g % 2 = 0 THEN 'user' ELSE 'assistant' END)::"Role",
       'seed-c-'||((g % 5000) + 1), 'seed-u-'||((g % 200) + 1),
       now() - (g || ' seconds')::interval
FROM generate_series(1, 50000) g;

INSERT INTO "Attachment" (id, kind, status, "mimeType", bytes, "publicId",
                          "resourceType", folder, "userId", "messageId", "createdAt")
SELECT 'seed-a-'||g, 'IMAGE'::"AttachmentKind",
       -- PENDING is a transient state that lasts seconds, so abandoned rows are
       -- rare (0.2% here). Seeding 10% PENDING made a seq scan genuinely
       -- cheaper than the index because LIMIT 200 was satisfied almost
       -- immediately -- which is not the shape of the production table the
       -- sweep runs against every 15 minutes.
       (CASE WHEN g % 500 = 0 THEN 'PENDING' ELSE 'READY' END)::"AttachmentStatus",
       'image/jpeg', 1000, 'seed/'||g, 'image', 'medical/images',
       'seed-u-'||((g % 200) + 1),
       -- NULL messageId for PENDING keeps the seed legal under
       -- Attachment_bound_requires_ready.
       CASE WHEN g % 500 = 0 THEN NULL ELSE 'seed-m-'||((g % 50000) + 1) END,
       now() - (g || ' seconds')::interval
FROM generate_series(1, 20000) g;

ANALYZE "User", "Conversation", "Message", "Attachment";
`;

interface PlanNode {
  "Node Type": string;
  "Index Name"?: string;
  "Relation Name"?: string;
  Plans?: PlanNode[];
}

function walk(node: PlanNode, visit: (n: PlanNode) => void): void {
  visit(node);
  for (const child of node.Plans ?? []) walk(child, visit);
}

const client = new Client({ connectionString });
await client.connect();

let failures = 0;

try {
  await client.query("BEGIN");
  if (seed) {
    console.log("Seeding synthetic data (rolled back at the end)…");
    await client.query(SEED_SQL);
  }

  for (const check of checks) {
    const { rows } = await client.query<{ "QUERY PLAN": [{ Plan: PlanNode; "Execution Time": number }] }>(
      { text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${check.sql}`, values: check.values as never[] },
    );
    const result = rows[0]["QUERY PLAN"][0];

    const indexes: string[] = [];
    let seqScannedTarget = false;
    walk(result.Plan, (node) => {
      if (node["Index Name"]) indexes.push(node["Index Name"]);
      if (
        node["Node Type"] === "Seq Scan" &&
        node["Relation Name"] === check.relation
      ) {
        seqScannedTarget = true;
      }
    });

    const usedExpected = indexes.includes(check.expectedIndex);
    const ok = usedExpected && !seqScannedTarget;
    if (!ok) failures += 1;

    console.log(`\n${ok ? "✓" : "✗"} ${check.name}`);
    console.log(`   source:   ${check.source}`);
    console.log(`   expects:  ${check.expectedIndex}`);
    console.log(`   used:     ${indexes.length ? indexes.join(", ") : "(none)"}`);
    console.log(`   seq scan: ${seqScannedTarget ? `yes on ${check.relation}` : "no"}`);
    console.log(`   time:     ${result["Execution Time"].toFixed(2)} ms`);
  }
} finally {
  // Nothing this script inserted is ever committed.
  await client.query("ROLLBACK");
  await client.end();
}

if (failures > 0) {
  console.error(
    `\n${failures} quer${failures === 1 ? "y" : "ies"} did not use the index added for it. Either the index is wrong or it is unnecessary — do not keep an index nothing uses.`,
  );
  process.exit(1);
}
console.log("\nEvery index is used by the query it was added for.");
