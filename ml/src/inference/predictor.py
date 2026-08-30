"""
Inference and prediction serving module.

Loads trained models and scalers, applies calibration, and outputs
calibrated risk probabilities and contributing signals.
"""

from pathlib import Path
import numpy as np
import pandas as pd
from ..models.risk_model import load_model
from ..models.risk_model import predict as raw_predict


class RiskPredictor:
    """Production risk prediction service."""

    def __init__(self, model_dir: str = "models/artifacts", version: str = "v1"):
        self.model_dir = model_dir
        self.version = version
        self.model, self.scaler, self.metadata = load_model(model_dir, version)
        self.feature_names = self.metadata.get("feature_names", [])

    def score_features(self, X: np.ndarray | pd.DataFrame) -> dict:
        """
        Score a feature vector or matrix.

        Returns predictions, probabilities, and risk levels.
        """
        if isinstance(X, pd.DataFrame):
            X_mat = X[self.feature_names].values
        else:
            X_mat = X

        preds, probs = raw_predict(self.model, self.scaler, X_mat)

        risk_levels = []
        for p in probs:
            if p >= 0.75:
                risk_levels.append("critical")
            elif p >= 0.50:
                risk_levels.append("high")
            elif p >= 0.25:
                risk_levels.append("medium")
            else:
                risk_levels.append("low")

        return {
            "predictions": preds.tolist(),
            "probabilities": probs.tolist(),
            "risk_levels": risk_levels,
            "model_version": self.version,
        }

    def explain_instance(self, feature_row: pd.Series | dict) -> list[dict]:
        """
        Generate top contributing risk signals for an instance based on feature values
        and model weights.
        """
        if isinstance(feature_row, dict):
            feature_row = pd.Series(feature_row)

        signals = []
        # Feature-specific heuristic explanation rules grounded in model features
        if feature_row.get("total_sharing_score", 0) > 3:
            signals.append({
                "signal_type": "entity_linkage",
                "severity": "high",
                "message": f"Entity shares {int(feature_row['total_sharing_score'])} connections across devices, IPs, or payment methods.",
                "weight": 0.85,
            })

        if feature_row.get("graph_community_customer_count", 0) >= 3:
            signals.append({
                "signal_type": "cluster_density",
                "severity": "high",
                "message": f"Belongs to dense graph cluster with {int(feature_row['graph_community_customer_count'])} connected customer accounts.",
                "weight": 0.80,
            })

        if feature_row.get("velocity_count_24h_max", 0) > 5 or feature_row.get("txn_per_day", 0) > 4:
            signals.append({
                "signal_type": "velocity_spike",
                "severity": "medium",
                "message": "High transaction velocity burst observed in a 24-hour window.",
                "weight": 0.65,
            })

        if feature_row.get("fail_rate", 0) > 0.3:
            signals.append({
                "signal_type": "payment_failures",
                "severity": "medium",
                "message": f"Elevated transaction failure rate: {feature_row['fail_rate']:.1%}.",
                "weight": 0.55,
            })

        if feature_row.get("is_night_mean", 0) > 0.5:
            signals.append({
                "signal_type": "unusual_timing",
                "severity": "low",
                "message": "Unusual late-night transaction activity pattern.",
                "weight": 0.40,
            })

        return sorted(signals, key=lambda s: s["weight"], reverse=True)
