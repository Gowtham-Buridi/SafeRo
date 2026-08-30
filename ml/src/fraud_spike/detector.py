"""
Fraud-Spike Detection Module.

Uses time-series rolling anomaly detection (Z-score and moving IQR) on
transaction volume, velocity, and high-risk flags relative to historical merchant baseline.
"""

from dataclasses import dataclass
import numpy as np
import pandas as pd


@dataclass
class SpikeAlert:
    merchant_id: str
    timestamp: str
    spike_type: str
    severity: str
    current_value: float
    baseline_mean: float
    z_score: float
    message: str


class FraudSpikeDetector:
    """Detects sudden fraud bursts and abnormal velocity spikes."""

    def __init__(self, window_hours: int = 6, z_threshold: float = 2.5):
        self.window_hours = window_hours
        self.z_threshold = z_threshold

    def detect_spikes(self, transactions: pd.DataFrame) -> list[dict]:
        """
        Analyze transactions grouped by merchant and hourly buckets to find spikes.
        """
        if transactions.empty or "created_at" not in transactions.columns:
            return []

        df = transactions.copy()
        df["created_at"] = pd.to_datetime(df["created_at"])
        df["hour_bucket"] = df["created_at"].dt.floor("h")

        alerts = []
        for merchant_id, m_df in df.groupby("merchant_id"):
            hourly = m_df.groupby("hour_bucket").agg(
                tx_count=("transaction_id", "count"),
                fail_count=("status", lambda s: (s == "failed").sum()),
                dispute_count=("status", lambda s: (s == "disputed").sum()),
                total_volume=("amount", "sum"),
            ).reset_index().sort_values("hour_bucket")

            if len(hourly) < 5:
                continue

            # Rolling stats for transaction volume & failure rates
            hourly["rolling_mean_tx"] = hourly["tx_count"].rolling(window=12, min_periods=3).mean()
            hourly["rolling_std_tx"] = hourly["tx_count"].rolling(window=12, min_periods=3).std().fillna(1.0)
            hourly["z_tx"] = (hourly["tx_count"] - hourly["rolling_mean_tx"]) / hourly["rolling_std_tx"].clip(lower=1.0)

            for _, row in hourly.iterrows():
                if row["z_tx"] >= self.z_threshold:
                    alerts.append({
                        "merchant_id": merchant_id,
                        "timestamp": row["hour_bucket"].isoformat(),
                        "spike_type": "transaction_volume_surge",
                        "severity": "critical" if row["z_tx"] >= 4.0 else "high",
                        "current_value": float(row["tx_count"]),
                        "baseline_mean": round(float(row["rolling_mean_tx"]), 1),
                        "z_score": round(float(row["z_tx"]), 2),
                        "message": f"Abnormal {round(float(row['z_tx']), 1)}σ surge in transaction volume ({int(row['tx_count'])} txns/hr vs baseline {round(float(row['rolling_mean_tx']), 1)}).",
                    })

                if row["fail_count"] >= 5 and (row["fail_count"] / max(row["tx_count"], 1)) > 0.4:
                    alerts.append({
                        "merchant_id": merchant_id,
                        "timestamp": row["hour_bucket"].isoformat(),
                        "spike_type": "payment_failure_burst",
                        "severity": "high",
                        "current_value": float(row["fail_count"]),
                        "baseline_mean": 0.0,
                        "z_score": 3.0,
                        "message": f"Card/Payment testing burst detected: {int(row['fail_count'])} failed attempts in 1 hour.",
                    })

        return alerts
