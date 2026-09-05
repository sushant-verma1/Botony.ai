# Backend Guide

## Stack

- Node.js
- Express
- TypeScript
- Prisma
- Neon PostgreSQL

---

## Layer Responsibilities

Routes

- Endpoint definitions
- Middleware registration

Never:

- Business logic
- Prisma queries

---

Controllers

Responsibilities

- Read request
- Validate required params
- Call services
- Return responses

Never:

- AI calls
- Database access
- Business rules

---

Services

Contain all business logic.

Examples

- Authentication
- Chat
- Emergency detection
- Conversation management

Services may:

- Query Prisma
- Call Claude
- Use utilities

---

Middleware

Examples

- Authentication
- Authorization
- Validation
- Logging
- Rate limiting

Middleware should remain reusable.

---

## Request Flow

Route

↓

Middleware

↓

Controller

↓

Service

↓

Prisma / Claude

↓

Response

---

## Guidelines

- Prefer composition over duplication.
- Keep controllers small.
- Write reusable services.
- Add validation before business logic.
- Log meaningful events.