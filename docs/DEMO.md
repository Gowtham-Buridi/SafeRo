# SafeRo — Razorpay Buildathon Demo Script & Walkthrough

## 1. Executive Summary
SafeRo is an AI Risk Intelligence platform designed for merchants to detect and neutralize **coordinated abuse rings** — groups of fraudulent accounts sharing physical device fingerprints, VPN gateways, and synthetic payment instruments to commit refund fraud, chargeback abuse, and card testing.

---

## 2. Quickstart to Run the Demo Locally

```bash
# 1. Start Backend API
npm run dev:api
# API will start on http://localhost:3001

# 2. Start Frontend Web App
npm run dev:web
# Web UI will start on http://localhost:5173

# 3. Optional: Re-run ML Pipeline & Evaluation
cd ml
py src/pipeline.py
```

---

## 3. Recommended 3-Minute Demo Flow

### Screen 1: Risk Command Center (`/dashboard`)
- **Key Points to Highlight**:
  - Live surveillance of 25,000+ transactions and ₹38.4M volume evaluated across merchants.
  - Active alert banner flagging **Abuse Cluster #000** with 8 colluding customer accounts.
  - Daily transaction throughput vs. identified abuse ring bursts.
  - Real-time model health badge showing calibrated probability engine and 100% held-out test precision.

### Screen 2: Abuse Ring Investigation Hero Workspace (`/abuse-rings`) — *HERO FEATURE*
- **Key Points to Highlight**:
  - **Left Roster**: Lists detected Louvain graph community clusters ranked by risk probability and financial exposure.
  - **Center Interactive Graph**: Interactive D3 force-directed graph allowing investigators to pan, zoom, drag nodes, and click individual accounts to inspect device and IP links.
  - **Right Forensic Evidence Dossier**: Ground-truth evidence cards detailing shared device hardware (`dev_f4a89c`), shared VPN gateway (`ip_103_21_244_12`), and payment nexus tokens.
  - **Timeline**: Chronological transactions initiated by ring members displaying disputed and captured amounts.

### Screen 3: Transaction Surveillance (`/transactions`)
- **Key Points to Highlight**:
  - Filterable transaction grid with status, payment instrument, and search.
  - Click on any high-risk transaction to open the slide-over **Forensic Investigation Panel**.
  - Shows calibrated probability score, evaluated model version (`v1.0.0-calibrated`), and individual contributing signals.

### Screen 4: AI Risk Investigation Workspace (`/investigation`)
- **Key Points to Highlight**:
  - Grounded AI reasoning assistant designed to eliminate hallucinations by binding all answers to deterministic backend graph and database evidence.
  - Prompts like *"Why is Abuse Ring #000 flagged as critical risk?"* produce structured evidence cards alongside the natural language explanation.
  - Clear architectural demarcation between **AI Explanation** and **Deterministic Model Result**.

### Screen 5: Risk & Model Performance Analytics (`/analytics`)
- **Key Points to Highlight**:
  - Empirical evaluation on **N=300 strictly held-out test instances**:
    - **Precision**: 100.0% (0 False Positives)
    - **Recall**: 81.8% (9/11 ring accounts caught)
    - **F1 Score**: 0.900
    - **Brier Score**: 0.0058 (Isotonic calibration)
  - **Business Cost Matrix**: Demonstrates net merchant savings of **+₹44,100** on the test slice alone by modeling ₹500 FP friction cost vs ₹5,000 fraud chargeback loss.
