# 🧠 AI Medical Counselor (Prototype)

A safe, AI-powered medical information assistant designed to provide **educational health guidance** with strict safety guardrails.

> ⚠️ **Disclaimer:** This is a prototype and NOT a substitute for professional medical advice, diagnosis, or treatment.

---

## 🚀 Overview

This project is an AI-driven chat application that helps users understand medical symptoms in a **safe and controlled manner**.

Unlike typical AI chat apps, this system includes:

* Emergency detection
* Safety filtering
* Legal disclaimers
* Controlled AI responses

---

## 🎯 Key Features

### 🛑 Safety First

* Emergency symptom detection (e.g., chest pain, breathing issues)
* Severity classification (Critical / Urgent / Normal)
* Immediate redirection for emergencies (no AI response)

### 🤖 AI-Powered Responses

* Uses Claude API for generating responses
* Strict system prompt to avoid:

  * Diagnosis
  * Prescriptions
  * Overconfident answers

### 🔐 Authentication & Security

* User authentication (JWT or Clerk)
* Password hashing (bcrypt)
* Rate limiting to prevent abuse
* Secure headers via Helmet

### 💬 Chat System

* Persistent conversations
* Message history storage
* Real-time chat interface

### ⚖️ Legal & Compliance

* Medical disclaimers in every response
* Terms of Service & Privacy Policy
* Age verification (13+)
* Audit logging for all actions

---

## 🏗️ Tech Stack

### Frontend

* React (Vite)
* Tailwind CSS
* React Router
* Axios
* React Hot Toast

### Backend

* Node.js
* Express.js
* JWT Authentication
* bcryptjs
* Joi (validation)
* Helmet, CORS, Rate Limiter
* Winston / Morgan (logging)

### Database

* PostgreSQL (Neon DB)

### AI

* Anthropic Claude API

### Deployment

* Railway (backend + frontend)

---

## 🧩 Architecture

```
User → Frontend → Backend → Safety Layer → AI → Database
```

### Important Rule:

* ❌ Frontend NEVER calls AI directly
* ✅ Backend controls all AI interactions

---

## 🧠 Core System Flow

1. User sends message
2. Backend checks for emergency symptoms
3. If critical:

   * Return emergency response
   * Skip AI call
4. If normal:

   * Send to AI with controlled prompt
   * Process response
   * Add disclaimer
5. Store conversation in database
6. Return response to frontend

---

## 📁 Project Structure

```
medical-ai-prototype/
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── utils/
│   │   └── server.js
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── App.jsx
│
├── docs/
├── README.md
```

---

## ⚙️ Installation

### 1. Clone Repository

```
git clone <your-repo-url>
cd medical-ai-prototype
```

---

### 2. Setup Backend

```
cd backend
npm install
```

Create `.env` file:

```
DATABASE_URL=your_database_url
ANTHROPIC_API_KEY=your_api_key
JWT_SECRET=your_secret
PORT=3000
```

Run backend:

```
npm run dev
```

---

### 3. Setup Frontend

```
cd frontend
npm install
npm run dev
```

---

## 🔐 Environment Variables

| Variable          | Description                  |
| ----------------- | ---------------------------- |
| DATABASE_URL      | PostgreSQL connection string |
| ANTHROPIC_API_KEY | Claude API key               |
| JWT_SECRET        | Token secret                 |
| PORT              | Backend port                 |

---

## ⚠️ Safety Considerations

This project includes:

* Input validation
* Emergency detection
* AI response constraints
* No medical prescriptions
* Legal disclaimers

---

## 🚨 Limitations

* Not medically certified
* AI may generate incorrect information
* Requires professional medical verification

---

## 🛣️ Future Improvements

* Doctor consultation integration
* Appointment booking system
* Improved AI fine-tuning
* Multi-language support
* Voice-based interaction

---

## 📜 License

This project is for **educational and prototype purposes only**.

---

## 👨‍💻 Author

Built by: *You*

---

## ⚠️ Final Disclaimer

This system is **NOT a doctor**.

If you experience serious symptoms:
👉 Seek immediate medical attention
👉 Contact emergency services

---
