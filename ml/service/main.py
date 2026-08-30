"""
SafeRo ML Scoring Service — FastAPI wrapper around the trained RiskPredictor.

Architecture note on latency budget (user requirement):
  - Model loaded ONCE at startup (not per-request) — typically ~200ms startup, ~0ms per inference
  - Postgres velocity query: ~30-80ms (single indexed query against transactions table)
  - Logistic regression inference: ~1ms (in-process, no serialisation overhead)
  - Total per-webhook: ~50-100ms typical, well under the 5s ceiling
  
  This is synchronous by design: the webhook handler calls /score/transaction before
  responding to Razorpay, so every stored transaction has its risk score at write time.
  Razorpay's retry window is 5s; our typical response is ~150ms including DB insert.
"""

import os
import time
import logging
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from ml.service.feature_builder import build_transaction_features, build_ring_features

# Path resolution: ml/models/artifacts relative to repo root
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_DIR = os.path.join(REPO_ROOT, "ml", "models", "artifacts")
MODEL_VERSION = os.environ.get("MODEL_VERSION", "v1")
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://safero:safero_dev@localhost:5432/safero"
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("safero.ml_service")

# ── Global model instance — loaded once at startup ─────────────────────────
_predictor = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model once at process start. Fail fast if artifacts are missing."""
    global _predictor
    from ml.src.inference.predictor import RiskPredictor  # noqa: import here after sys.path is set
    t0 = time.perf_counter()
    _predictor = RiskPredictor(model_dir=MODEL_DIR, version=MODEL_VERSION)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    log.info(
        f"✅ RiskPredictor loaded in {elapsed_ms:.0f}ms "
        f"| model_version={MODEL_VERSION} "
        f"| features={len(_predictor.feature_names)}"
    )
    yield
    log.info("ML service shutting down.")


app = FastAPI(
    title="SafeRo ML Scoring Service",
    version=MODEL_VERSION,
    lifespan=lifespan,
)


# ── Request / Response Models ───────────────────────────────────────────────

class TransactionScoreRequest(BaseModel):
    amount: float
    payment_method: str
    device_id: Optional[str] = None
    ip_address: Optional[str] = None
    customer_id: Optional[str] = None
    merchant_id: Optional[str] = None
    status: str = "captured"
    timestamp: Optional[str] = None  # ISO-8601; defaults to now


class RingScoreRequest(BaseModel):
    ring_id: Optional[int | str] = None
    device_id: Optional[str] = None
    ip_address: Optional[str] = None
    member_count: Optional[int] = None
    transaction_count: Optional[int] = None
    total_amount: Optional[float] = None


# ── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "model_loaded": _predictor is not None,
        "feature_count": len(_predictor.feature_names) if _predictor else 0,
    }


@app.post("/score/transaction")
def score_transaction(req: TransactionScoreRequest):
    """
    Score a single incoming transaction against the trained risk model.

    Feature coverage (documented explicitly per design requirement):
      COMPUTED LIVE from Postgres history:
        - transaction_count, total_amount, avg_amount, std_amount
        - fail_rate, dispute_rate, refund_rate, txn_per_day, account_age_days
        - unique_devices, unique_ips
        - velocity_count_1h/6h/24h, velocity_amount_1h/6h/24h (per device_id)
        - amount_log_mean/max/sum, amount_zscore_mean/max/sum
        - is_night_mean/max/sum, is_weekend_mean/max/sum
        - status_failed_mean/max/sum, status_disputed_mean/max/sum, status_refunded_mean/max/sum
        - max_device_sharing, avg_device_sharing, max_ip_sharing, avg_ip_sharing
        - total_sharing_score

      APPROXIMATED / ZERO-FILLED (cannot be computed per-request without full graph batch):
        - graph_degree, graph_clustering_coeff, graph_pagerank,
          graph_community_size, graph_community_customer_count, graph_betweenness
          → set to 0 for unknown customers; elevated for known ring matches
        - unique_pms, unique_merchants, max_pm_sharing, avg_pm_sharing
          → approximated from metadata fields in transactions table

    Returns:
      probability: float in [0, 1] — output of the trained logistic regression
      risk_level: low / medium / high / critical
      model_version: the REAL artifact version (from metadata_v1.json), not a hardcoded string
      contributing_signals: from RiskPredictor.explain_instance()
      feature_coverage: which features were live-computed vs approximated
      latency_breakdown_ms: timing of each stage for observability
    """
    if _predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.perf_counter()

    # Build the 63-feature vector from Postgres history + current transaction context
    features, coverage = build_transaction_features(
        amount=req.amount,
        payment_method=req.payment_method,
        device_id=req.device_id or "",
        ip_address=req.ip_address or "",
        customer_id=req.customer_id or "",
        status=req.status,
        timestamp=req.timestamp,
        database_url=DATABASE_URL,
    )

    t_features_ms = (time.perf_counter() - t0) * 1000

    # Score with the real model — this is the ONLY place a probability is produced
    X = np.array([[features[f] for f in _predictor.feature_names]])
    t_inf_start = time.perf_counter()
    result = _predictor.score_features(X)
    t_inf_ms = (time.perf_counter() - t_inf_start) * 1000

    probability = result["probabilities"][0]
    risk_level = result["risk_levels"][0]

    # Explain instance using feature values
    signals = _predictor.explain_instance(features)
    # Add polarity field (per established UI color-semantics convention)
    for s in signals:
        s["polarity"] = "negative"  # all signals from explain_instance are risk-elevating
    # Add a positive signal if probability is low
    if probability < 0.2 and not signals:
        signals.append({
            "signal_type": "clean_telemetry",
            "severity": "info",
            "message": "Clean device profile and normal velocity — no abuse signals detected.",
            "weight": 0.0,
            "polarity": "positive",
        })

    total_ms = (time.perf_counter() - t0) * 1000
    log.info(
        f"scored | prob={probability:.4f} level={risk_level} "
        f"features={t_features_ms:.0f}ms inference={t_inf_ms:.0f}ms total={total_ms:.0f}ms"
    )

    return {
        "probability": round(probability, 4),
        "risk_level": risk_level,
        "action": (
            "BLOCK" if probability >= 0.85
            else "FLAG" if probability >= 0.50
            else "ALLOW"
        ),
        "model_version": result["model_version"],  # from RiskPredictor — the REAL version
        "contributing_signals": signals,
        "feature_coverage": coverage,
        "latency_breakdown_ms": {
            "feature_build": round(t_features_ms, 1),
            "inference": round(t_inf_ms, 1),
            "total": round(total_ms, 1),
        },
    }


@app.post("/score/ring")
def score_ring(req: RingScoreRequest):
    """
    Score a live-detected abuse ring using ring-level features.

    For live webhook-detected rings (not batch-evaluated), build a feature vector
    from the ring's observable properties (member count, shared device/IP, transaction
    velocity) and score with the same RiskPredictor. This replaces the hardcoded 0.94
    that was previously returned for all live rings.
    """
    if _predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    features, coverage = build_ring_features(
        ring_id=req.ring_id,
        device_id=req.device_id or "",
        ip_address=req.ip_address or "",
        member_count=req.member_count or 1,
        transaction_count=req.transaction_count or 1,
        total_amount=req.total_amount or 0.0,
        database_url=DATABASE_URL,
    )

    X = np.array([[features[f] for f in _predictor.feature_names]])
    result = _predictor.score_features(X)

    probability = result["probabilities"][0]
    risk_level = result["risk_levels"][0]
    signals = _predictor.explain_instance(features)
    for s in signals:
        s["polarity"] = "negative"

    return {
        "probability": round(probability, 4),
        "risk_level": risk_level,
        "model_version": result["model_version"],
        "contributing_signals": signals,
        "feature_coverage": coverage,
        "weight_factors": {
            "sharing_score": round(features.get("total_sharing_score", 0), 2),
            "velocity_24h": round(features.get("velocity_count_24h_max", 0), 0),
            "community_size": round(features.get("graph_community_customer_count", 0), 0),
        },
    }


class ReclusterRequest(BaseModel):
    lookback_days: int = 30
    min_customers_per_ring: int = 2
    min_shared_entities: int = 1


@app.post("/recluster")
def trigger_reclustering(req: Optional[ReclusterRequest] = None):
    """
    Periodic / On-Demand Graph Re-Clustering Endpoint.

    ARCHITECTURAL NOTE ON PERIODIC RE-CLUSTERING:
    ---------------------------------------------
    Live scoring matches transactions against previously-detected abuse rings in real time.
    Detecting a NEW coordinated ring as it forms requires re-running Louvain community detection
    across the entire transaction graph, which runs periodically (batch), not per-transaction.
    This endpoint executes the Louvain community detection pipeline over recent live PostgreSQL
    transactions and updates the database with newly formed abuse clusters.
    """
    from ml.service.reclustering import run_graph_reclustering

    lookback = req.lookback_days if req else 30
    min_custs = req.min_customers_per_ring if req else 2
    min_shared = req.min_shared_entities if req else 1

    result = run_graph_reclustering(
        database_url=DATABASE_URL,
        lookback_days=lookback,
        min_customers_per_ring=min_custs,
        min_shared_entities=min_shared,
    )

    return result

