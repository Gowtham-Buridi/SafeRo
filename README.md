# SafeRo — AI Risk Intelligence for Merchants

> **Defense-only coordinated abuse-ring detection using transaction behavior, anomaly detection, NetworkX graph intelligence, and calibrated machine learning.**

Built for the **Razorpay Buildathon**.

---

## Key Capabilities

1. **Primary Evaluated Capability — Coordinated Abuse-Ring Detection**:
   - Louvain graph community detection over entity relationships (customers, devices, IPs, payment methods).
   - Supervised classification with 65 engineered behavioral, velocity, and graph centrality features.
   - Isotonic probability calibration evaluated on a strictly held-out test set: **100% Precision, 81.8% Recall, 0.900 F1, 0.0058 Brier Score**.
   - Quantified business cost model showing **+₹44,100 net savings** (80.2% loss reduction) on the test slice.
2. **Fraud-Spike Detection**: Rolling statistical Z-score surveillance across hourly merchant transaction volume and card testing bursts.
3. **Chargeback Intelligence**: Forensic dossier aggregation linking dispute history, customer reputation, and device fingerprints.
4. **Return & RTO Risk Intelligence**: Serial returner categorization and refund policy recommendations.
5. **AI Risk Investigation Workspace**: Grounded AI reasoning assistant backed by deterministic backend graph and database evidence.

---

## Quick Start

### Prerequisites
- Node.js ≥ 20 (tested with 22.23.2)
- Python ≥ 3.11 (tested with 3.13.5)
- npm

### 1. Install & Build
```bash
# Clone and install dependencies
git clone <repo-url>
cd SafeRo
npm install

# Build frontend production bundle
npm run build:web
```

### 2. Start Application Servers
```bash
# Terminal 1: Start Backend API (runs on port 3001)
npm run dev:api

# Terminal 2: Start Frontend Web UI (runs on port 5173)
npm run dev:web
```

Open `http://localhost:5173` in your browser.

### 3. Run ML Pipeline & Tests
```bash
# Run End-to-End ML Pipeline
cd ml
py src/pipeline.py

# Run ML Test Suite
py -m pytest tests/ -v

# Run Backend Tests
cd ..
npm run test:api

# Run Frontend Tests
npm run test:web
```

---

## Architecture & Technology Stack

- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + D3.js + Recharts + Lucide Icons
- **Backend**: Fastify 5 + TypeScript + Pino Logging + Helmet Security + CORS + Rate Limiting
- **ML Engine**: Python 3.13 + scikit-learn + NetworkX + pandas + NumPy + Pydantic
- **Database**: PostgreSQL 16 schema with 17 relational tables, UUIDs, JSONB metadata, and auto-update triggers
- **Zero Paid Dependencies**: 100% Free / Open-Source dependencies.

---

## Documentation

| Document | Purpose |
|---|---|
| [MODEL_CARD.md](docs/MODEL_CARD.md) | Model architecture, held-out test metrics, confusion matrix, and cost analysis |
| [DEMO.md](docs/DEMO.md) | 3-minute hackathon presentation script and demo walkthrough |
| [ML_EVALUATION.md](docs/ML_EVALUATION.md) | Complete empirical evaluation methodology and candidate model benchmark |
| [PRD.md](docs/PRD.md) | Product Requirements Document |
| [TRD.md](docs/TRD.md) | Technical Requirements Document |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system data flow and architecture diagrams |
| [SECURITY.md](docs/SECURITY.md) | Defense-only posture, PII hashing, and threat model |

---

## License

MIT — Defense-Only. Built for the Razorpay Buildathon.
