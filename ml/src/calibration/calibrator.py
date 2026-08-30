"""
Probability calibration for risk scores.

Ensures predicted probabilities align with actual frequencies.
Uses isotonic regression calibration and evaluates with Brier score.
"""

from typing import Any, Literal
import numpy as np
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import brier_score_loss


def calibrate_model(
    model: Any,
    X_train: np.ndarray,
    y_train: np.ndarray,
    method: Literal["isotonic", "sigmoid"] = "isotonic",
) -> Any:
    """
    Calibrate a model using cross-validation.
    """
    calibrated = CalibratedClassifierCV(
        estimator=model, method=method, cv=3
    )
    calibrated.fit(X_train, y_train)
    return calibrated


def evaluate_calibration(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_bins: int = 10,
) -> dict:
    """
    Evaluate calibration quality.

    Returns Brier score and calibration curve data.
    """
    brier = brier_score_loss(y_true, y_prob)

    prob_true, prob_pred = calibration_curve(
        y_true, y_prob, n_bins=n_bins, strategy="uniform"
    )

    return {
        "brier_score": float(brier),
        "calibration_curve": {
            "mean_predicted_probability": prob_pred.tolist(),
            "fraction_of_positives": prob_true.tolist(),
        },
    }
