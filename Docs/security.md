# Security Guide

Security overrides convenience.

---

## Authentication

Access Token

- Memory only

Refresh Token

- HttpOnly Cookie

Never use localStorage.

---

## Authorization

Every protected endpoint must:

- Authenticate user
- Verify ownership
- Validate permissions

---

## Validation

Validate:

- Input
- Types
- Required fields
- Business rules

Never trust the client.

---

## Secrets

Keep secrets in environment variables.

Never expose:

- JWT secrets
- API keys
- Passwords
- Cookies

---

## Logging

Never log:

- Passwords
- Tokens
- Cookies
- Medical information

---

## Medical Safety

Emergency detection executes before Claude.

Never remove:

- Safety checks
- Medical disclaimers

---

## Production

- HTTPS only
- Secure cookies
- Rate limiting
- CORS restrictions