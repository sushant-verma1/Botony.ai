# 📌 DECISIONS.md

This document records key architectural and technical decisions made during the development of the **AI Medical Counselor (Prototype)**.

---

# 🧠 1. Project Type Decision

### Decision:

Build a **Medical Information Assistant**, NOT a diagnostic system.

### Reason:

* Avoid legal risks
* Prevent misleading medical advice
* Keep system educational only

### Implication:

* No prescriptions
* No diagnosis
* Always include disclaimers

---

# ⚙️ 2. Backend Architecture

### Decision:

Use a **custom backend (Node.js + Express)**

### Reason:

* Full control over safety logic
* Ability to implement emergency detection
* Secure handling of AI API keys
* Enforce response filtering

### Alternative Considered:

* Supabase-only backend ❌ (rejected)

### Why Rejected:

* Cannot enforce complex safety rules
* AI calls would be exposed
* Limited control over logic

---

# 🗄️ 3. Database Choice

### Decision:

Use **PostgreSQL (Neon DB)**

### Reason:

* Relational structure fits:

  * users
  * conversations
  * messages
  * audit logs
* Strong consistency
* Supports complex queries

### Alternatives Considered:

* MongoDB ❌
* Supabase DB (optional fallback)

### Why MongoDB Rejected:

* Poor fit for relational data
* Weak for audit logging

---

# 🔐 4. Authentication Strategy

### Decision:

Use **Clerk OR custom JWT authentication**

### Reason:

* Clerk → faster development
* JWT → deeper learning + control

### Final Approach:

Flexible (can switch based on needs)

---

# 🤖 5. AI Integration

### Decision:

Use **Claude API (Anthropic)**

### Reason:

* Better control over responses
* Stronger alignment for safety
* Suitable for conversational tasks

### Critical Rule:

* AI is NEVER called directly from frontend

```txt
Frontend → Backend → AI
```

---

# 🛑 6. Safety Architecture (Core Decision)

### Decision:

Implement a **Safety-First Pipeline**

```txt
User Input → Safety Layer → AI → Response Filter → User
```

### Components:

* Emergency detection
* Severity classification
* Response filtering
* Medical disclaimers

### Reason:

* Prevent harmful outputs
* Handle critical situations properly
* Reduce liability

---

# ⚠️ 7. Emergency Handling System

### Decision:

Block AI for critical symptoms

### Example:

* Chest pain
* Breathing issues
* Loss of consciousness

### Behavior:

* Return emergency message
* Do NOT call AI

---

# ⚖️ 8. Legal & Compliance

### Decision:

Include legal safeguards from early stage

### Features:

* Age verification (13+)
* Terms of Service
* Privacy Policy
* Medical disclaimers
* Audit logging

### Reason:

* Required for healthcare-related systems
* Protects developer from liability

---

# 💬 9. Chat System Design

### Decision:

Store all conversations in database

### Tables:

* users
* conversations
* messages

### Reason:

* Maintain chat history
* Enable audit logs
* Improve debugging

---

# 🔒 10. Security Measures

### Decision:

Implement multiple layers of security

### Includes:

* JWT authentication
* Password hashing (bcrypt)
* Rate limiting
* CORS restrictions
* Secure headers (Helmet)

---

# ☁️ 11. Deployment Strategy

### Decision:

Use **Railway** for deployment

### Reason:

* Easy setup
* Supports full-stack apps
* Good for MVP

### Alternatives:

* Vercel (frontend only)
* AWS (future scaling)

---

# 📁 12. Project Structure

### Decision:

Separate frontend and backend

```
frontend/
backend/
docs/
```

### Reason:

* Better organization
* Easier scaling
* Clear separation of concerns

---

# 🧩 13. Development Approach

### Decision:

Follow phased development (3 months)

### Phases:

1. Foundation (setup + core backend)
2. Safety & refinement
3. Deployment & documentation

### Reason:

* Structured progress
* Reduced complexity
* Easier debugging

---

# 🚨 14. Critical Rules (Must Not Break)

* ❌ No direct AI calls from frontend

* ❌ No medical diagnosis or prescriptions

* ❌ No storing sensitive data insecurely

* ✅ Always include disclaimers

* ✅ Always check for emergency symptoms

* ✅ Always validate user input

---

# 🎯 Summary

This project prioritizes:

* Safety over intelligence
* Control over convenience
* Structure over speed

The system is designed as a **controlled AI assistant**, not an autonomous medical authority.

---