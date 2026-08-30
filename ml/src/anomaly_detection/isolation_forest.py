"""
Anomaly detection using Isolation Forest.

Detects individual transaction/account-level anomalies based on feature space.
Does not hardcode anomaly scores — learns from data distribution.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


def train_anomaly_detector(
    features: np.ndarray,
    contamination: float = 0.05,
    random_state: int = 42,
    n_estimators: int = 200,
) -> IsolationForest:
    """Train an Isolation Forest anomaly detector."""
    model = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        random_state=random_state,
        n_jobs=-1,
    )
    model.fit(features)
    return model


def predict_anomaly_scores(
    model: IsolationForest,
    features: np.ndarray,
) -> np.ndarray:
    """
    Get anomaly scores from the trained model.

    Returns scores in [0, 1] where higher = more anomalous.
    Original Isolation Forest scores are negative (lower = more anomalous),
    so we invert and normalize.
    """
    raw_scores = model.decision_function(features)
    # Invert: more negative = more anomalous → higher score
    inverted = -raw_scores
    # Normalize to [0, 1]
    min_s, max_s = inverted.min(), inverted.max()
    if max_s - min_s > 0:
        normalized = (inverted - min_s) / (max_s - min_s)
    else:
        normalized = np.zeros_like(inverted)
    return normalized


def get_anomaly_labels(
    model: IsolationForest,
    features: np.ndarray,
) -> np.ndarray:
    """Get binary anomaly labels. 1 = anomaly, 0 = normal."""
    predictions = model.predict(features)
    # IsolationForest: -1 = anomaly, 1 = normal
    return (predictions == -1).astype(int)
