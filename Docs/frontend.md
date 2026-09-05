# Frontend Guide

## Stack

- React
- Vite
- Tailwind
- Axios
- Context API

---

## Responsibilities

Frontend is responsible for:

- UI
- Navigation
- Forms
- Local state
- API communication

Frontend is NOT responsible for:

- Medical decisions
- Authentication logic
- Database access
- Claude prompts

---

## Structure

components/
Reusable UI

pages/
Screens

layouts/
Shared layouts

hooks/
Reusable logic

context/
Global state

api/
Backend communication

utils/
Helper functions

---

## State

Use Context only for:

- User
- Authentication
- Session

Keep temporary UI state local.

---

## API

Use one Axios client.

Do not:

- Duplicate API clients
- Hardcode URLs
- Call Claude directly

---

## UI Standards

Every async action should support:

- Loading
- Error state
- Success feedback

Use semantic HTML and accessible components.