# Reminder delivery deployment and verification

## Services

Medication reminders require three independently running services:

1. PostgreSQL is the durable source for schedules, `ReminderJob`, dose events,
   and notifications.
2. Redis is only BullMQ and cross-instance SSE infrastructure.
3. The API (`dist/server.js`) serves authenticated SSE and browser-push
   subscription endpoints. The reminder worker (`dist/src/workers/reminder.worker.js`)
   consumes delayed jobs.

The API is live at `GET /health/live`. It is ready only when Postgres and
Redis are reachable at `GET /health/ready`.

## Local container deployment

Copy `Backend/.env.example` to `Backend/.env`, fill the existing database,
auth, AI, Cloudinary, and VAPID variables, then run:

```bash
docker compose -f docker-compose.reminders.yml up --build
```

The frontend is deployed separately. Configure its build with the API URL and
the same public VAPID key. Browser Push requires HTTPS outside localhost.

## Database migration

Before releasing a new image, apply migrations against a staging database and
then production:

```bash
cd Backend
npx prisma migrate deploy
npx prisma generate
```

Use the existing `npm run migrate:verify` process on a disposable Neon branch
before production.

## End-to-end verification without AI

With Redis and the database available, run:

```bash
cd Backend
npm run verify:reminders
```

The script creates isolated disposable data, adds a due job through BullMQ,
runs a real queue worker, and asserts the durable notification, scheduled dose
event, dispatched job state, and Redis real-time event. It deletes all test
data afterward. It does not call Gemini or Groq.

To manually verify browser delivery: sign in, enable browser medication
reminders in Settings, schedule a reminder a few minutes ahead, close the
Botony tab, and confirm the browser notification appears. The service worker
must be registered and notification permission granted; an idle worker shown
as `stopped` in browser DevTools is normal and wakes for Push events.
