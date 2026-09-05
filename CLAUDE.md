# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Medical AI assistant focused on safe symptom guidance (prototype/MVP). It does NOT diagnose diseases or replace healthcare professionals.

Always prioritize completing MVP functionality before implementing planned features. Do not implement future healthcare modules unless explicitly requested.

---

# Core Principles

These rules override all other instructions.

1. Patient safety comes first.
2. The backend owns business logic.
3. React is a presentation layer.
4. Claude is only called from the backend.
5. Security takes priority over convenience.
6. Extend existing modules instead of creating parallel implementations.
7. The source code is the source of truth.

---

# Commands

Backend (run from `Backend/`):
```
npm run server              # dev server, nodemon + tsx, hot reload
npm start                   # run once with tsx (no reload)
npm run build                # tsc compile check
npm test                     # vitest run (single pass)
npm run test:watch           # vitest watch mode
npx vitest run <path>        # run a single test file, e.g. src/utils/safety.util.test.ts
npx prisma migrate dev       # create/apply a migration from schema.prisma
npx prisma generate          # regenerate the Prisma client after schema changes
```

Frontend (run from `frontend/`):
```
npm run dev                  # vite dev server
npm run build                # tsc -b && vite build
npm run lint                  # eslint .
npm test                     # vitest run (jsdom + Testing Library)
npx vitest run <path>        # run a single test file, e.g. src/components/Chat.test.tsx
```

Tests are colocated with source (`foo.ts` + `foo.test.ts`). Backend tests run against real env var names but stub values (see `Backend/vitest.config.ts`); no live DB or Anthropic key needed. Backend requires `ANTHROPIC_API_KEY`, `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` at runtime (`Backend/src/config/config.ts` throws on startup if any are missing); frontend reads `VITE_API_URL`.

---

# Architecture

Frontend (React + Vite + Tailwind + Axios) → Express routes → middleware → controllers → services → Prisma / Claude → response.

```
route (src/routes)        → endpoint + middleware wiring only
  ↓
middleware (src/middleware) → auth, validation, rate limiting
  ↓
controller (src/controllers) → request handling only, calls services
  ↓
service (src/services)     → business logic, Prisma queries, Claude calls
  ↓
Prisma / Claude / Response
```

Business logic belongs in services; controllers stay thin (see `Backend/src/controllers/chat.controller.ts` and `Backend/src/services/claude.ts` as the pattern to follow — note the chat controller currently does more DB/business work inline than the ideal split described in `Docs/backend.md`; when touching it, prefer extracting to a service over adding more inline logic).

Key request flow — `POST /api/chat/:chatid/message` (`Backend/src/controllers/chat.controller.ts`):
1. `protect` middleware verifies the access token (`Backend/src/middleware/auth.middleware.ts`).
2. `validate` middleware checks the body against a Joi schema (`Backend/src/validation/validate.ts`).
3. `chatLimiter` rate-limits the endpoint (`Backend/src/middleware/rateLImit.middleware.ts`).
4. Controller runs `detectEmergency()` (`Backend/src/utils/safety.util.ts`) **before** any Claude call. If emergency, returns a canned emergency response and skips Claude entirely.
5. Otherwise calls `getClaudeResponse()` (`Backend/src/services/claude.ts`), appends `getMedicalDisclaimer()`, and persists both messages via Prisma.

Auth: access token is a short-lived JWT (15m) returned in the response body and kept in memory on the frontend; refresh token is a 7d JWT set as an HttpOnly cookie (`Backend/src/controllers/auth.controller.ts`, `Backend/src/utils/auth.util.ts`). Never store JWTs in localStorage.

Database: Prisma against Neon Postgres. Schema at `Backend/prisma/schema.prisma` — `User` → `Conversation` → `Message`, cascade deletes on both relations. Conversation `status` tracks `ongoing`/`emergency`.

Frontend structure: `components/` (UI), `pages/`, `context/AuthContext.tsx` (auth state), `services/api/` (Axios clients, e.g. `api.ts`, `chatApi.ts`), `types/`. The frontend never calls Claude or Prisma directly — everything goes through `services/api/`.

`Docs/` has more detail per area (`architecture.md`, `backend.md`, `database.md`, `frontend.md`, `security.md`, `roadmap.md`); the code is the source of truth if they disagree.

---

# Medical Safety

Never remove:
- emergency detection
- medical disclaimers
- validation
- authentication

Emergency detection always executes before Claude.

---

# Before Writing Code

Always:
- search for an existing implementation
- extend existing services where appropriate
- reuse utilities
- keep changes consistent with the existing architecture

Avoid unnecessary abstractions.

---

# Coding Standards

Controllers — request handling only.
Services — business logic.
Routes — endpoint definitions.
Middleware — authentication, authorization, validation, rate limiting.
Utilities — reusable helper functions.

---

# Security

Never:
- store JWTs in localStorage
- expose secrets
- call Claude from React
- bypass authentication
- bypass authorization
- disable validation

---

# Before Major Changes

Before introducing new architecture, new folders, new libraries, or large refactors, first determine whether the existing implementation can be extended. Prefer incremental improvements.

---

# When Documentation Conflicts

The repository code is the source of truth. If documentation disagrees with implementation:
1. Follow the code.
2. Mention the inconsistency.
3. Recommend updating the documentation.
