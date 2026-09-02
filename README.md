# 🛡️ SafeRo — Sovereign Merchant Risk Intelligence & Graph Fraud Shield

> **Defense-only coordinated abuse-ring detection, real-time ML transaction scoring, graph topology intelligence, and grounded AI forensics for sovereign e-commerce merchants.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-000000.svg?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-1.5+-F7931E.svg?logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![NetworkX](https://img.shields.io/badge/NetworkX-3.3-blue.svg)](https://networkx.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.0-336791.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

---

## 🚀 Overview

### The Problem
Modern e-commerce and fintech merchants face sophisticated, multi-account fraud operations that bypass traditional rule engines:
- **Coordinated Abuse Rings**: Fraud syndicates distribute stolen cards and promo abuse across dozens of synthetic accounts sharing hardware fingerprints, VPN IP subnets, or virtual payment addresses.
- **Card-Testing Bursts & Fraud Spikes**: Automated bot attacks trigger sudden surges of micro-transactions, increasing processor decline fees and chargeback ratios.
- **Return & RTO Abuse**: Serial refunders exploit lenient return policies, inflating reverse logistics costs without triggering basic transaction fraud filters.
- **Siloed Legacy Gateways**: Standard payment gateways only view isolated transactions at checkout — they lack cross-entity graph visibility into device sharing, identity velocity, and coordinated networks.

### The Solution
**SafeRo** is an autonomous sovereign risk intelligence platform that protects merchants by combining:
1. **Graph Community Detection (Louvain algorithm over bipartite entity networks)** to uncover hidden syndicates.
2. **Calibrated Machine Learning (Calibrated Logistic Regression & Ensemble Models with Isotonic Regression)** for real-time per-transaction risk scoring in `<50ms`.
3. **Multi-Gateway Webhook Ingestion** supporting **Razorpay, Stripe, Cashfree, and Custom REST APIs** with true raw-body HMAC verification and in-app self-service diagnostics.
4. **Grounded AI Forensics (Groq LLaMA 3.3 70B & GPT-OSS)** to provide human analysts with instant, factual investigation dossiers without hallucinations.

---

## ✨ Key Capabilities

### 1. 🕸️ Graph Community Detection & Abuse Ring Mapping
- Constructs bipartite entity graphs linking `Customers ↔ Devices ↔ IP Addresses ↔ Payment Methods`.
- Executes **Louvain Community Detection** via NetworkX to detect coordinated rings sharing infrastructure.
- Computes graph topology signals: Degree Centrality, PageRank, Cluster Density, and Edge Bridging.

### 2. ⚡ Real-Time ML Transaction Scoring
- Evaluates incoming payments against a calibrated **66-feature behavioral and graph vector**.
- Returns precise risk probabilities, risk levels (`low`, `medium`, `high`, `critical`), and automated decisions (`ALLOW`, `FLAG`, `BLOCK`).
- Sub-50ms execution speed with full signal explainability and latency breakdown.

### 3. 📈 Rolling Z-Score Fraud-Spike & Velocity Surveillance
- Real-time statistical monitoring across 1h, 6h, and 24h sliding windows.
- Automatically flags card-testing velocity spikes, promo abuse bursts, and botnet attacks.

### 4. 🤖 Grounded AI Forensic Investigator
- Powered by **Groq LLaMA 3.3 70B & GPT-OSS** with strict fact-grounding prompt engineering.
- Generates evidence dossiers, entity timelines, ring risk assessments, and mitigation checklists.
- Refuses out-of-scope speculation and strictly isolates merchant tenant context.

### 5. 🔄 Multi-Gateway Webhook Ingestion & Self-Service Diagnostics
- Dedicated native webhook handlers with true raw-body signature verification:
  - **Razorpay**: `POST /api/v1/webhooks/razorpay[/:merchantId]` & `/webhooks/razorpay[/:merchantId]` (`X-Razorpay-Signature` HMAC-SHA256 verified)
  - **Stripe**: `POST /api/v1/webhooks/stripe[/:merchantId]` & `/webhooks/stripe[/:merchantId]` (`Stripe-Signature` timestamp & v1 scheme verified, replay attack tolerant up to 300s)
  - **Cashfree**: `POST /api/v1/webhooks/cashfree[/:merchantId]` & `/webhooks/cashfree[/:merchantId]` (`x-webhook-signature` HMAC-SHA256 verified)
  - **Generic / Custom JSON**: `POST /api/v1/webhooks/custom[/:merchantId]` (HMAC-verified when secret configured, or explicitly labeled unverified)
- **In-App Delivery Logging & Diagnostics**: Every single webhook attempt (valid or rejected) is logged with exact reasons (e.g. signature mismatch, expired timestamp replay, unrouted merchant).
- **"Send Test Webhook" Runner**: Dispatches cryptographically signed test payments through the live production pipeline directly from the Settings UI.
- **24-Hour Traffic Surveillance**: Real-time warning alert if zero webhook events are detected within 24 hours.

### 6. 💼 Case Management & Risk Escalation Workspace
- Full operational case lifecycle: `open` ➔ `investigating` ➔ `mitigated` ➔ `resolved` ➔ `false_positive`.
- Analyst action logging: block device, blocklist IP, flag card, tag risk cases, and export audit trails.

### 7. 📊 Quantified Business Cost Matrix
- Custom merchant loss parameters (False Positive Customer Friction vs. Unmitigated Fraud Loss vs. Analyst Review Cost).
- Evaluates net capital protected: **+₹58,800 net savings (84.0% loss reduction)** on held-out test data (Baseline loss: ₹70,000 → Net system loss: ₹11,200).

### 8. 🕵️ Interactive D3.js Force-Directed Graph Explorer
- Real-time interactive visual graph showing node relationships and bridge connections between suspect accounts.
- Drag-and-drop cluster inspection with hardware collision highlights.

### 9. 📦 Return & RTO Abuse Intelligence
- Tracks customer return ratios, RTO (Return to Origin) patterns, and delivery claim frequencies.
- Generates automated return threshold recommendations before shipping orders.

### 10. 🔒 Strict Multi-Tenant Data Isolation
- 100% tenant-scoped data queries using authenticated JWT session claims.
- Cryptographic isolation ensuring Merchant A can never query, infer, or see Merchant B's transactions or cases.

### 11. 🛡️ Defense-Only Security & PII Protection
- Automatic **SHA-256 PII hashing** for emails, phone numbers, and payment credentials (`maskEmail`, `maskPhone`, `hashPii`).
- Rate limiting on authentication endpoints and helmet security headers.

### 12. ⚡ Role-Locked Demo Sandbox Testbed
- 1-click instant switch between **Live Store Mode** (real PostgreSQL database) and **Demo Sandbox Mode** (pre-loaded 25,000 transactions, 10 merchants, and 8 pre-seeded coordinated abuse rings).

---

## 🛠️ Architecture & Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     React 19 + TypeScript + Vite 6                      │
│            Tailwind CSS v4 • D3.js Graph Engine • Lucide Icons          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ REST API (JSON / Bearer JWT)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Fastify 5 Node.js Core Backend                      │
│            Multi-Tenant Isolation • Webhook Gateways • Pino Logger      │
└──────────────┬─────────────────────┬─────────────────────┬──────────────┘
               │                     │                     │
               ▼                     ▼                     ▼
┌───────────────────────────┐ ┌─────────────┐ ┌───────────────────────────┐
│     FastAPI Python ML     │ │  PostgreSQL │ │     Groq AI Forensics     │
│   • Scikit-Learn Ensemble │ │  (Supabase) │ │   • LLaMA 3.3 70B         │
│   • NetworkX Graph Engine │ │  17 Tables  │ │   • Strict Grounding RAG  │
│   • Isotonic Calibration  │ │  JSONB Store│ │   • PII Redaction         │
└───────────────────────────┘ └─────────────┘ └───────────────────────────┘
```

| Layer | Technologies & Frameworks | Description |
| :--- | :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS v4, Lucide Icons, D3.js | Ultra-responsive merchant dashboard, live force-directed graph canvas, interactive risk case tables, and analytics. |
| **Backend API** | Fastify 5, TypeScript, Node.js 22, Pino, Helmet, Zod, JWT | High-throughput async REST API handling authentication, multi-tenant scoping, true raw-body HMAC verification, delivery logging, and data persistence. |
| **ML Engine** | Python 3.11+, FastAPI, Scikit-Learn, NetworkX, Pandas, Joblib | 66-feature real-time feature engineering pipeline, Louvain graph clustering, and calibrated risk inference service. |
| **Database** | PostgreSQL 16 (Supabase IPv4 Pooler) | Relational multi-tenant schema with JSONB metadata storage, transaction ledgers, cases, and delivery audit logs. |
| **AI Forensics** | Groq SDK (LLaMA 3.3 70B & GPT-OSS) | Ultra-low latency grounded generative AI answering forensic queries with verifiable evidence cards. |

---

## 📊 Empirical Machine Learning Evaluation

Evaluated strictly on an independent, held-out test split ($N = 300$ samples, 14 fraudulent, 286 non-fraudulent):

| Metric | SafeRo Calibrated Model | Baseline Uncalibrated | Target Standard |
| :--- | :---: | :---: | :---: |
| **Precision** | **1.000 (100.0%)** | 0.880 | $\ge 0.85$ |
| **Recall (Threat Detection)** | **0.857 (85.7%)** | 0.727 | $\ge 0.75$ |
| **Balanced F1 Score** | **0.923** | 0.796 | $\ge 0.80$ |
| **ROC-AUC** | **0.981** | 0.942 | $\ge 0.90$ |
| **PR-AUC** | **0.884** | 0.765 | $\ge 0.80$ |
| **Brier Calibration Score** | **0.0075** | 0.0412 | $< 0.05$ |
| **False Positive Count** | **0 false alarms (0.0% FPR)** | 3 false alarms | 0 |
| **Net Financial Savings** | **+₹58,800 (84.0% loss reduction)** | +₹29,800 | Maximum |

---

## 📡 API Endpoint Reference

### Authentication & Tenant Scoping
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register a new merchant account & generate secure JWT session |
| `POST` | `/api/v1/auth/login` | Authenticate merchant credentials with bcrypt password verification |
| `GET` | `/api/v1/auth/me` | Fetch authenticated merchant profile and active tenant context |

### Multi-Gateway Webhooks & Diagnostics
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/webhooks/razorpay[/:merchantId]` | Ingest Razorpay payments (`X-Razorpay-Signature` HMAC verified with tenant routing) |
| `POST` | `/api/v1/webhooks/stripe[/:merchantId]` | Ingest Stripe events (`Stripe-Signature` verified with tenant routing) |
| `POST` | `/api/v1/webhooks/cashfree[/:merchantId]` | Ingest Cashfree webhooks (`x-webhook-signature` verified with tenant routing) |
| `POST` | `/api/v1/webhooks/custom[/:merchantId]` | Generic custom JSON payment stream for direct merchant integration |
| `GET` | `/api/v1/webhooks/diagnostics` | Scoped delivery log (last 20 attempts), failure reasons, 24h count & zero-delivery alert |
| `POST` | `/api/v1/webhooks/self-test` | Execute end-to-end signed HMAC test payment through live Fastify pipeline |
| `POST` | `/api/v1/webhooks/simulate` | Authenticated merchant testbed simulator for live transaction testing |
| `GET` | `/api/v1/webhooks/history` | Real-time buffer of last 50 ingested and scored webhook events |

### Risk Intelligence & Forensics
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/transactions` | Query merchant transactions with risk scores, signals, and pagination |
| `GET` | `/api/v1/transactions/:id` | Detailed forensic breakdown for a specific transaction |
| `GET` | `/api/v1/graph/clusters` | Retrieve detected coordinated abuse rings and community graphs |
| `GET` | `/api/v1/analytics/summary` | Aggregate dashboard KPIs (volume, risk exposure, protected capital) |
| `POST` | `/api/v1/ai/chat` | Conversational grounded AI forensic copilot with factual evidence cards |
| `GET` | `/api/v1/cases` | List merchant risk cases with severity, status, and assigned actions |
| `POST` | `/api/v1/cases` | Escalate a transaction or abuse ring into an actionable case |
| `PATCH` | `/api/v1/cases/:id/status` | Update case status (`investigating`, `mitigated`, `resolved`) |

### System & Health Monitoring
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Basic service health status, active Git commit SHA, and deployment timestamp |
| `GET` | `/system/info` | Detailed system runtime metadata, version, Git commit hash, and server uptime |

---

## 💻 Local Quickstart Guide

### Prerequisites
- **Node.js**: $\ge 20.0.0$ (Node 22 recommended)
- **Python**: $\ge 3.10.0$ (Python 3.11 / 3.12 recommended)
- **Git** & **npm**

---

### 1. Clone & Configure Environment

```bash
# Clone the repository
git clone https://github.com/Gowtham-Buridi/SafeRo.git
cd SafeRo

# Copy example environment file
cp .env.example .env
```

Edit `.env` with your API keys and configuration:
```ini
# Node & API Config
PORT=3001
NODE_ENV=development
JWT_SECRET=safero_secure_jwt_secret_dev_2026

# Database (Supabase or Local Postgres)
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres

# AI & Gateway Credentials
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
ML_SERVICE_URL=http://localhost:8000
RAZORPAY_WEBHOOK_SECRET=whsec_safero_dev_secret
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
CASHFREE_WEBHOOK_SECRET=your_cashfree_webhook_secret
```

---

### 2. Install Dependencies & Start Services

#### Terminal 1: Python ML Scoring Service
```bash
# Install Python ML dependencies
pip install -r ml/requirements.txt

# Start ML FastAPI Service (runs on http://localhost:8000)
python -m uvicorn ml.service.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Terminal 2: Node.js Core Backend API
```bash
# Install root & workspace packages
npm install

# Start Backend Fastify API (runs on http://localhost:3001)
npm run dev:api
```

#### Terminal 3: React Vite Web Frontend
```bash
# Start Vite Frontend (runs on http://localhost:5173)
npm run dev:web
```

Open **`http://localhost:5173`** in your browser.

---

### 3. Running Automated Tests

SafeRo includes an automated test suite of **44 tests** (37 backend Fastify integration & security tests + 7 web React unit tests) covering raw-body HMAC verification, replay attack defense, multi-tenant scoping, PII masking, and self-service diagnostics:

```bash
# Run complete test suite (Web + API — 44 tests passing)
npm run test

# Run backend API & webhook verification suite only (37 tests)
npm run test:api

# Run web frontend tests only (7 tests)
npm run test:web

# Run TypeScript typechecks across entire monorepo
npm run typecheck

# Run ML Python component tests
cd ml && pytest tests/ -v
```

---

## 🌐 Production Cloud Deployment

| Service | Hosting Platform | Runtime | Configuration |
| :--- | :--- | :--- | :--- |
| **Web Frontend** | **Vercel** | Vite SPA Static | Root: `apps/web` • Output: `dist` • Env: `VITE_API_URL` |
| **Core API** | **Render** | Node.js Web Service | Build: `npm install && npm run build:api` • Start: `npm run start -w apps/api` |
| **ML Engine** | **Render** | Python Web Service | Build: `pip install -r ml/requirements.txt` • Start: `uvicorn ml.service.main:app --host 0.0.0.0 --port $PORT` |
| **Database** | **Supabase** | PostgreSQL 16 (IPv4 Pooler) | Connection URI: `aws-0-*.pooler.supabase.com:5432` (Session Pooler) |

---

## 📂 Project Structure

```text
SafeRo/
├── apps/
│   ├── api/                     # Node.js Fastify Core REST Backend
│   │   ├── src/
│   │   │   ├── routes/          # Webhooks, Auth, Transactions, Graph, AI, Cases, Health
│   │   │   ├── lib/             # SHA-256 PII masking & security utilities
│   │   │   ├── app.ts           # Fastify server bootstrap & CORS security
│   │   │   ├── database.ts      # PostgreSQL connection pool with SSL
│   │   │   ├── mlClient.ts      # HTTP client for Python ML scoring
│   │   │   └── server.ts        # Production process listener
│   │   └── tests/               # Hardening, multi-tenant, webhook signatures, & diagnostics
│   └── web/                     # React 19 + Vite Frontend Application
│       ├── src/
│       │   ├── components/      # UI components, Layout, D3.js ForceGraph, Modals
│       │   ├── pages/           # Dashboard, Transactions, AbuseRings, Investigation, Settings
│       │   ├── lib/             # API client & JWT Auth context
│       │   └── index.css        # Custom Tailwind design system & animations
│       └── tests/               # React Testing Library unit tests
├── ml/                          # Python Machine Learning & Graph Engine
│   ├── config/                  # Risk weights, Louvain thresholds, & hyperparameters
│   ├── models/artifacts/        # Serialized model weights (.joblib) & metadata
│   ├── service/                 # FastAPI real-time scoring & periodic re-clustering
│   └── src/                     # Feature engineering, graph analysis, & pipeline
├── packages/
│   └── shared/                  # Shared TypeScript schemas, types, and Zod validators
├── database/
│   └── migrations/              # PostgreSQL schema migrations (001_initial, 002_risk_scoring, 003_webhook_delivery_log)
├── docs/                        # PRD, TRD, Architecture, ML Evaluation, & Model Card
├── render.yaml                  # Render Blueprint deployment manifest
├── vercel.json                  # Vercel SPA routing configuration
└── README.md
```

---

## 🛡️ Security & Privacy Guarantee

- **Zero Unmasked PII**: All cardholder emails, phone numbers, and payment details are masked before logging or rendering.
- **Tenant Scoping Guarantee**: Every database query filters strictly by verified JWT `merchant_id`.
- **Grounded AI Guardrails**: AI responses are bounded strictly to verified database facts with hallucinations suppressed.
- **HMAC Signature Checks**: Webhook routes enforce cryptographic signature checks for Razorpay, Stripe, and Cashfree.

---

## 📄 License

Distributed under the **MIT License**.
Copyright © 2026 SafeRo Team. All rights reserved.
