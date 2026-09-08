# Migration verification & index justification

How a schema change gets from `prisma/schema.prisma` to Neon production
without being applied there first "to see if it works".

Two things are verified, in this order:

1. **The migration applies cleanly to a real Postgres** — a Neon staging
   branch, not a local SQLite/Docker approximation.
2. **Every index earns its place** — each one is tied to a query the app
   actually issues, and `EXPLAIN ANALYZE` proves the planner uses it.

---

## 1. Create a disposable Neon branch

Neon branches are copy-on-write and cost nothing to throw away, which makes
them the right target: the branch has production's *shape* without production's
data risk.

```bash
# Neon CLI (npx neonctl), or the Neon console → Branches → New branch
npx neonctl branches create --name migrate-verify --parent main
npx neonctl connection-string migrate-verify
```

Two connection strings are useful:

| Variable | Purpose |
|---|---|
| `STAGING_DATABASE_URL` | the branch migrations are applied to |
| `STAGING_SHADOW_DATABASE_URL` | a second, **empty** branch/database Prisma replays migrations into |

Set them in your shell, not in `.env` — nothing here belongs in a committed
file, and `STAGING_DATABASE_URL` must never point at production. Both scripts
below refuse to run against a URL containing `prod`, but that check is a
seatbelt, not a substitute for reading the string.

## 2. Offline pre-check (no database needed)

Before touching any database, confirm the hand-written or generated SQL is
what Prisma itself would produce for the schema change:

```bash
cd Backend
npx prisma migrate diff \
  --from-schema <previous schema.prisma> \
  --to-schema prisma/schema.prisma \
  --script
```

The output must match the new migration's SQL. This catches a mis-typed column
or a forgotten index without a network round trip. It does **not** catch SQL
that is only valid against a database that already has the change — that is
what step 3 is for.

> Note: statements Prisma cannot model — currently the
> `Attachment_bound_requires_ready` CHECK constraint — will not appear in this
> diff. That is expected: Prisma leaves unknown constraints alone rather than
> dropping them, but it also means such statements must be reviewed by hand and
> never removed from an existing migration file.

## 3. Verify against the staging branch

```bash
cd Backend
STAGING_DATABASE_URL=... STAGING_SHADOW_DATABASE_URL=... npm run migrate:verify
```

`scripts/verify-migrations.ts` runs four checks and stops at the first failure:

| # | Check | Catches |
|---|---|---|
| 1 | `prisma migrate deploy` | SQL that only works against an already-migrated database; ordering problems; anything that fails on a fresh history |
| 2 | `prisma migrate status` | migrations applied out of band, or a history that no longer matches the files on disk |
| 3 | `migrate diff --from-config-datasource --to-schema --exit-code` | drift: the migration ran but the result isn't what `schema.prisma` describes (i.e. a migration is missing) |
| 4 | `migrate diff --from-migrations --to-schema --exit-code` | replaying the whole migration folder into an empty database produces a different schema than `schema.prisma` |

Prisma 7 removed the `--from-url` and `--shadow-database-url` flags. Checks 3 and 4
read their databases from `prisma.config.ts` instead, which takes `DATABASE_URL` and
`SHADOW_DATABASE_URL` — `scripts/verify-migrations.ts` sets both from the `STAGING_*`
variables above before shelling out.

Check 4 is skipped with a warning if no shadow URL is set.

## 4. Verify the indexes on the same branch

```bash
EXPLAIN_DATABASE_URL=$STAGING_DATABASE_URL npm run db:explain
```

`scripts/explain-indexes.ts` runs `EXPLAIN (ANALYZE, BUFFERS)` on each query
the application issues and fails if the expected index was not used or the
target table was sequentially scanned.

It seeds representative synthetic data first (200 users, 5 000 conversations,
50 000 messages, 20 000 attachments) inside a transaction that is **always
rolled back** — nothing is committed. This matters: Postgres correctly prefers
a sequential scan on a near-empty table, so running `EXPLAIN` against a fresh
staging branch without seed data would "prove" that every index is useless.
Pass `-- --no-seed` to measure real data on a branch that has some.

## 5. Deploy and dispose

```bash
DATABASE_URL=<production> npx prisma migrate deploy
npx neonctl branches delete migrate-verify
```

---

## Index justification

Each index exists for a named query. An index nothing uses is pure write
overhead on every insert and update, so anything not on this list should be
dropped rather than kept "just in case".

| Index | Query it serves | Why the composite/order |
|---|---|---|
| `Conversation(userId, updatedAt)` | `listConversationsController` — `where userId order by updatedAt desc` | `updatedAt` trails the equality column, so the index satisfies the filter **and** the sort with no sort node. A bare `(userId)` index would still require sorting every one of a user's conversations. |
| `Message(conversationId, createdAt)` | `getHistoryController` cursor pagination and `messageController`'s `previousMessages` fetch | Same shape: equality on `conversationId`, ordering on `createdAt`. This is the hottest read path in the app. |
| `Message(userId)` | Cascade delete of a `User`'s messages | Postgres does **not** index foreign keys automatically. Without this, deleting one user sequentially scans the entire message table. No trailing column: nothing orders messages by user. |
| `Attachment(userId, createdAt)` | Cascade delete of a `User`'s attachments | Same FK argument as above. `createdAt` trails so the same index can also list a user's attachments in order, should that endpoint ever exist — it costs nothing extra on an index that has to exist anyway. |
| `Attachment(messageId)` | Loading a message's attachments; cascade delete of a `Message`'s attachments | Second unindexed FK. |
| `Attachment(status, createdAt)` | `sweepAbandonedAttachments` — `where status = 'PENDING' and createdAt < cutoff` | Added with the scheduled cleanup. The sweep runs every 15 minutes forever; without this it scans every attachment ever uploaded to find the handful that were abandoned. Low-cardinality leading column is fine here because the predicate always pairs it with the `createdAt` range. |

Deliberately **not** indexed:

- `Conversation(userId)` alone — redundant with the composite, whose leading
  column already serves it.
- `Message(createdAt)` / `Attachment(createdAt)` alone — no query filters on
  time without also filtering on a conversation, user, or status.
- `Attachment(publicId)` — already unique, so already indexed.
- `Message(role)`, `Message(emergencyDetected)`, `Conversation(status)` — low
  cardinality, no query filters on them, and each would add write cost to the
  message insert that happens on every single chat turn.
