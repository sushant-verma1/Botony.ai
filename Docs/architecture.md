# Architecture

## Overview

The application follows a layered architecture.

Frontend
↓
Express Routes
↓
Middleware
↓
Controllers
↓
Services
↓
Prisma / External APIs
↓
Database

Business logic belongs inside services.

Controllers remain thin.

The frontend should never implement backend business rules.

---

## Principles

- Single responsibility
- Incremental improvements
- Reuse existing modules
- Avoid duplicate implementations
- Backend owns business logic
- React handles presentation
- Source code is the source of truth

---

## AI Integration

Claude API is called only from the backend.

Preferred flow:

User
→ Validation
→ Emergency Detection
→ Claude
→ Medical Disclaimer
→ Save Conversation
→ Response

Emergency requests must never reach Claude.

---

## Folder Responsibilities

backend/
- Routes
- Controllers
- Services
- Middleware
- Prisma
- Utilities

frontend/
- Pages
- Components
- Hooks
- Context
- API Layer

docs/
Project documentation

---

## Adding New Features

Before creating new files:

1. Search existing implementation.
2. Extend existing modules.
3. Create new abstractions only if necessary.

Avoid large refactors unless requested.