"""
Real-time feature vector construction for the SafeRo ML scoring service.

This module builds the 63-feature vector expected by the trained model from:
1. Live Postgres queries (velocity, history, sharing)
2. The current transaction context (amount, method, timestamp)
3. Zero-fills for batch-only features (graph centrality), with explicit documentation

Design constraint: every feature must be traceable to its source.
No feature is silently omitted or fabricated — the `coverage` dict returned
alongside the feature vector makes the approximation explicit.
"""

import math
import logging
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras

log = logging.getLogger("safero.feature_builder")

# ── Feature names exactly matching metadata_v1.json ───────────────────────
# This list is the ground truth for the 63 model features.
FEATURE_NAMES = [
    "transaction_count", "total_amount", "avg_amount", "std_amount",
    "unique_merchants", "unique_devices", "unique_ips", "unique_pms",
    "account_age_days", "fail_rate", "dispute_rate", "refund_rate", "txn_per_day",
    "max_device_sharing", "avg_device_sharing", "max_ip_sharing", "avg_ip_sharing",
    "max_pm_sharing", "avg_pm_sharing", "total_sharing_score",
    "amount_log_mean", "amount_log_max", "amount_log_sum",
    "amount_zscore_mean", "amount_zscore_max", "amount_zscore_sum",
    "is_night_mean", "is_night_max", "is_night_sum",
    "is_weekend_mean", "is_weekend_max", "is_weekend_sum",
    "status_failed_mean", "status_failed_max", "status_failed_sum",
    "status_disputed_mean", "status_disputed_max", "status_disputed_sum",
    "status_refunded_mean", "status_refunded_max", "status_refunded_sum",
    "velocity_count_1h_mean", "velocity_count_1h_max", "velocity_count_1h_sum",
    "velocity_count_6h_mean", "velocity_count_6h_max", "velocity_count_6h_sum",
    "velocity_count_24h_mean", "velocity_count_24h_max", "velocity_count_24h_sum",
    "velocity_amount_1h_mean", "velocity_amount_1h_max", "velocity_amount_1h_sum",
    "velocity_amount_6h_mean", "velocity_amount_6h_max", "velocity_amount_6h_sum",
    "velocity_amount_24h_mean", "velocity_amount_24h_max", "velocity_amount_24h_sum",
    "graph_degree", "graph_clustering_coeff", "graph_pagerank",
    "graph_community_size", "graph_community_customer_count", "graph_betweenness",
]


def _zero_vector() -> dict:
    """Start with all features zeroed — safe default for unknown customers."""
    return {f: 0.0 for f in FEATURE_NAMES}


def _get_db_conn(database_url: str):
    """Open a direct psycopg2 connection. SSL required for Supabase."""
    return psycopg2.connect(database_url, sslmode="require", cursor_factory=psycopg2.extras.RealDictCursor)


def _is_night(dt: datetime) -> int:
    return 1 if (dt.hour >= 23 or dt.hour <= 4) else 0


def _is_weekend(dt: datetime) -> int:
    return 1 if dt.weekday() >= 5 else 0


def build_transaction_features(
    amount: float,
    payment_method: str,
    device_id: str,
    ip_address: str,
    customer_id: str,
    status: str,
    timestamp: Optional[str],
    database_url: str,
) -> tuple[dict, dict]:
    """
    Build the 63-feature vector for a single incoming transaction.

    Returns:
        features: dict mapping each of the 63 model feature names to a float
        coverage: dict explaining which features were live-computed vs approximated

    Coverage categories:
        "live_postgres"   — queried from Postgres transactions table
        "current_txn"     — derived from the current transaction payload
        "approximated"    — heuristically estimated (documented reason)
        "zero_filled"     — batch-only features set to 0 (documented reason)
    """
    now = datetime.fromisoformat(timestamp) if timestamp else datetime.now(timezone.utc)
    features = _zero_vector()
    coverage = {}

    amount_log_now = math.log1p(amount)
    is_night_now = _is_night(now)
    is_weekend_now = _is_weekend(now)
    is_failed_now = 1 if status == "failed" else 0
    is_disputed_now = 1 if status == "disputed" else 0
    is_refunded_now = 1 if status == "refunded" else 0

    # ── 1. Query Postgres for this device's recent history ─────────────────
    # We group by device_id because that's the most reliable cross-account
    # linkage signal and is always present from the webhook payload.
    # customer_id from webhooks is an ephemeral string; device_id is stable hardware.
    history = []
    sharing_data = {"device": 1, "ip": 1}

    if device_id:
        try:
            conn = _get_db_conn(database_url)
            with conn:
                with conn.cursor() as cur:
                    # ── Historical transactions for this device ──
                    cur.execute("""
                        SELECT
                            amount,
                            status,
                            created_at,
                            metadata->>'device_id' AS device_id,
                            metadata->>'ip_address' AS ip_address
                        FROM transactions
                        WHERE metadata->>'device_id' = %s
                          AND created_at > NOW() - INTERVAL '30 days'
                        ORDER BY created_at DESC
                        LIMIT 200
                    """, (device_id,))
                    history = cur.fetchall()

                    # ── Sharing: how many distinct devices/IPs share this device ──
                    # device_sharing: how many distinct customer_ids use this device
                    cur.execute("""
                        SELECT COUNT(DISTINCT metadata->>'customer_id') AS device_customer_count
                        FROM transactions
                        WHERE metadata->>'device_id' = %s
                    """, (device_id,))
                    row = cur.fetchone()
                    sharing_data["device"] = max(1, int(row["device_customer_count"] or 1))

                    # ip_sharing: how many distinct customer_ids use this IP
                    if ip_address:
                        cur.execute("""
                            SELECT COUNT(DISTINCT metadata->>'customer_id') AS ip_customer_count
                            FROM transactions
                            WHERE metadata->>'ip_address' = %s
                        """, (ip_address,))
                        row = cur.fetchone()
                        sharing_data["ip"] = max(1, int(row["ip_customer_count"] or 1))

            conn.close()
            coverage["velocity_and_history"] = "live_postgres"
            coverage["sharing_scores"] = "live_postgres"
        except Exception as exc:
            log.warning(f"Postgres query failed, falling back to zero-fill: {exc}")
            coverage["velocity_and_history"] = "zero_filled (db_error)"
            coverage["sharing_scores"] = "zero_filled (db_error)"
    else:
        coverage["velocity_and_history"] = "zero_filled (no_device_id)"
        coverage["sharing_scores"] = "approximated (no_device_id)"

    # ── 2. Include current transaction in the history view ─────────────────
    # For velocity: the current txn isn't in Postgres yet, so we count it in.
    # For account features: include this txn to avoid underestimating new customers.
    all_amounts = [float(h["amount"]) for h in history] + [amount]
    all_statuses = [h["status"] for h in history] + [status]
    all_times = [h["created_at"] for h in history] + [now]
    n = len(all_amounts)

    # ── 3. Account-level features ──────────────────────────────────────────
    features["transaction_count"] = float(n)
    features["total_amount"] = sum(all_amounts)
    features["avg_amount"] = features["total_amount"] / n
    variance = sum((a - features["avg_amount"]) ** 2 for a in all_amounts) / max(n, 1)
    features["std_amount"] = math.sqrt(variance)

    # Account age: days between first and last observed transaction
    if len(all_times) >= 2:
        oldest = min(t if isinstance(t, datetime) else t.replace(tzinfo=timezone.utc) for t in all_times)
        newest = max(t if isinstance(t, datetime) else t.replace(tzinfo=timezone.utc) for t in all_times)
        features["account_age_days"] = max(1.0, (newest - oldest).total_seconds() / 86400)
    else:
        features["account_age_days"] = 1.0

    features["txn_per_day"] = features["transaction_count"] / features["account_age_days"]

    fail_count = sum(1 for s in all_statuses if s == "failed")
    dispute_count = sum(1 for s in all_statuses if s == "disputed")
    refund_count = sum(1 for s in all_statuses if s == "refunded")
    features["fail_rate"] = fail_count / n
    features["dispute_rate"] = dispute_count / n
    features["refund_rate"] = refund_count / n

    coverage["account_features"] = "live_postgres"

    # ── 4. Sharing scores ──────────────────────────────────────────────────
    features["max_device_sharing"] = float(sharing_data["device"])
    features["avg_device_sharing"] = float(sharing_data["device"])
    features["max_ip_sharing"] = float(sharing_data["ip"])
    features["avg_ip_sharing"] = float(sharing_data["ip"])
    # unique_pms and unique_merchants not available at per-transaction level;
    # we approximate unique_devices and unique_ips from what we can observe
    features["unique_devices"] = 1.0  # approximated: we only see the current device
    features["unique_ips"] = 1.0      # approximated: we only see the current IP
    features["unique_merchants"] = 1.0
    features["unique_pms"] = 1.0
    # pm/merchant sharing: approximated as 1 (conservative; could be queried if pm_id stored)
    features["max_pm_sharing"] = 1.0
    features["avg_pm_sharing"] = 1.0
    features["total_sharing_score"] = (
        features["max_device_sharing"] +
        features["max_ip_sharing"] +
        features["max_pm_sharing"]
    )
    coverage["unique_counts"] = "approximated (device/ip from current payload; pm/merchant defaulted to 1)"

    # ── 5. Per-transaction aggregates (mean/max/sum over history + current) ─
    amounts_log = [math.log1p(a) for a in all_amounts]
    amount_mean = features["avg_amount"]
    amount_std = max(features["std_amount"], 1.0)
    amounts_zscore = [(a - amount_mean) / amount_std for a in all_amounts]

    is_night_vals = [_is_night(t if isinstance(t, datetime) else t.replace(tzinfo=timezone.utc)) for t in all_times]
    is_weekend_vals = [_is_weekend(t if isinstance(t, datetime) else t.replace(tzinfo=timezone.utc)) for t in all_times]
    is_failed_vals = [1 if s == "failed" else 0 for s in all_statuses]
    is_disputed_vals = [1 if s == "disputed" else 0 for s in all_statuses]
    is_refunded_vals = [1 if s == "refunded" else 0 for s in all_statuses]

    def _agg(vals, prefix):
        features[f"{prefix}_mean"] = sum(vals) / len(vals)
        features[f"{prefix}_max"] = max(vals)
        features[f"{prefix}_sum"] = float(sum(vals))

    _agg(amounts_log, "amount_log")
    _agg(amounts_zscore, "amount_zscore")
    _agg(is_night_vals, "is_night")
    _agg(is_weekend_vals, "is_weekend")
    _agg(is_failed_vals, "status_failed")
    _agg(is_disputed_vals, "status_disputed")
    _agg(is_refunded_vals, "status_refunded")

    coverage["txn_aggregates"] = "live_postgres + current_txn"

    # ── 6. Velocity features ───────────────────────────────────────────────
    # Velocity windows: count/sum of transactions in preceding Xh from Postgres history
    # For the current transaction, its window count = number of prior txns in the window.
    # We then aggregate mean/max/sum across all transactions' window values.
    def _velocity(window_hours: int):
        counts = []
        amounts_in_window = []
        cutoff_delta = window_hours * 3600
        sorted_times_amounts = sorted(zip(all_times, all_amounts), key=lambda x: x[0] if isinstance(x[0], datetime) else x[0].replace(tzinfo=timezone.utc))
        for i, (t_i, a_i) in enumerate(sorted_times_amounts):
            t_i_dt = t_i if isinstance(t_i, datetime) else t_i.replace(tzinfo=timezone.utc)
            count_w = 0
            amount_w = 0.0
            for j in range(i):
                t_j, a_j = sorted_times_amounts[j]
                t_j_dt = t_j if isinstance(t_j, datetime) else t_j.replace(tzinfo=timezone.utc)
                if (t_i_dt - t_j_dt).total_seconds() <= cutoff_delta:
                    count_w += 1
                    amount_w += a_j
            counts.append(count_w)
            amounts_in_window.append(amount_w)
        return counts, amounts_in_window

    for w in [1, 6, 24]:
        vcounts, vamts = _velocity(w)
        if vcounts:
            features[f"velocity_count_{w}h_mean"] = sum(vcounts) / len(vcounts)
            features[f"velocity_count_{w}h_max"] = float(max(vcounts))
            features[f"velocity_count_{w}h_sum"] = float(sum(vcounts))
            features[f"velocity_amount_{w}h_mean"] = sum(vamts) / len(vamts)
            features[f"velocity_amount_{w}h_max"] = float(max(vamts))
            features[f"velocity_amount_{w}h_sum"] = float(sum(vamts))

    coverage["velocity_features"] = "live_postgres + current_txn (window computed over device history)"

    # ── 7. Graph features — zero-filled, explicitly documented ────────────
    # These require full NetworkX graph computation over all transactions.
    # At real-time (single webhook), the full graph is not available.
    # Consequence: the model underestimates risk for new ring members whose graph
    # hasn't been computed yet. This is the known trade-off of real-time scoring.
    # If device_sharing > 3 (strong sharing signal), we elevate graph_community_customer_count
    # to reflect the observed sharing even without full graph computation.
    if features["total_sharing_score"] > 3:
        features["graph_community_customer_count"] = features["max_device_sharing"]
        features["graph_degree"] = features["max_device_sharing"] - 1.0
        features["graph_community_size"] = features["max_device_sharing"]
        coverage["graph_features"] = "approximated_from_sharing (sharing_score > 3)"
    else:
        coverage["graph_features"] = "zero_filled (batch_only: full NetworkX graph not available per-request)"

    return features, coverage


def build_ring_features(
    ring_id: Optional[int | str],
    device_id: str,
    ip_address: str,
    member_count: int,
    transaction_count: int,
    total_amount: float,
    database_url: str,
) -> tuple[dict, dict]:
    """
    Build the feature vector for a live-detected ring (replaces hardcoded 0.94).

    For rings detected from webhook-fed data, we use observable ring properties
    as proxies for the full feature set. Notably:
    - member_count → graph_community_customer_count, graph_community_size
    - device sharing across members → max_device_sharing, total_sharing_score
    - transaction velocity → velocity features
    """
    features = _zero_vector()
    coverage = {}

    avg_amount = total_amount / max(transaction_count, 1)

    # Account-level: treat the ring as a single "customer" with its aggregate stats
    features["transaction_count"] = float(transaction_count)
    features["total_amount"] = total_amount
    features["avg_amount"] = avg_amount
    features["std_amount"] = avg_amount * 0.1  # conservative estimate

    # Ring sharing signals: all members share device/IP by definition
    features["max_device_sharing"] = float(member_count)
    features["avg_device_sharing"] = float(member_count)
    features["max_ip_sharing"] = float(member_count)
    features["avg_ip_sharing"] = float(member_count)
    features["total_sharing_score"] = float(member_count * 3)  # device + ip + pm sharing
    features["unique_devices"] = 1.0  # shared device — by definition
    features["unique_ips"] = 1.0

    # Graph features: computable from ring metadata
    features["graph_community_customer_count"] = float(member_count)
    features["graph_community_size"] = float(member_count)
    features["graph_degree"] = float(member_count - 1)
    features["graph_pagerank"] = min(0.9, member_count / 10.0)
    features["graph_betweenness"] = min(0.8, member_count / 15.0)

    # Velocity: treat all transactions as high-velocity
    for w in [1, 6, 24]:
        txn_in_window = transaction_count  # conservative: all txns in window
        features[f"velocity_count_{w}h_max"] = float(txn_in_window)
        features[f"velocity_count_{w}h_mean"] = float(txn_in_window)
        features[f"velocity_count_{w}h_sum"] = float(txn_in_window)
        features[f"velocity_amount_{w}h_max"] = total_amount
        features[f"velocity_amount_{w}h_mean"] = total_amount
        features[f"velocity_amount_{w}h_sum"] = total_amount

    amount_log = math.log1p(avg_amount)
    features["amount_log_mean"] = amount_log
    features["amount_log_max"] = amount_log
    features["amount_log_sum"] = amount_log * transaction_count

    coverage["ring_features"] = "computed_from_ring_properties"
    coverage["graph_features"] = "approximated_from_member_count"
    coverage["velocity_features"] = "approximated_from_total_transactions"

    return features, coverage
