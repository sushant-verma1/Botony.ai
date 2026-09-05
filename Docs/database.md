# Database Guide

## Stack

- Prisma
- Neon PostgreSQL

---

## Core Models

User

↓

Conversation

↓

Message

---

## Rules

Every conversation belongs to a user.

Every message belongs to a conversation.

Never create orphaned records.

---

## Principles

- Normalize data
- Use relationships
- Avoid duplicate data
- Keep business logic out of SQL

---

## Migrations

Always:

1. Update schema.prisma
2. Generate migration
3. Apply migration
4. Commit migration

Never modify production manually.

---

## Queries

Prefer:

- Pagination
- Select required fields
- Prisma Client

Avoid:

- Raw SQL
- Deep includes
- Unbounded queries

---

## Future Models

- UserProfile
- MedicalHistory
- Allergy
- Medication
- Appointment
- Doctor
- Subscription