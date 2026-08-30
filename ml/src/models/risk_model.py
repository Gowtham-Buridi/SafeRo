"""
Supervised risk classification model.

Evaluates multiple candidate models and selects the best via
cross-validation on the training set. The held-out test set is
never used for model selection.
"""

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.preprocessing import StandardScaler


def get_candidate_models() -> dict[str, Any]:
    """Return candidate models to evaluate."""
    return {
        "logistic_regression": LogisticRegression(
            max_iter=1000, class_weight="balanced", random_state=42
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=200, max_depth=10, class_weight="balanced",
            random_state=42, n_jobs=-1
        ),
        "gradient_boosting": GradientBoostingClassifier(
            n_estimators=200, max_depth=5, learning_rate=0.1,
            random_state=42
        ),
    }


def evaluate_candidates(
    X_train: np.ndarray,
    y_train: np.ndarray,
    n_folds: int = 5,
) -> pd.DataFrame:
    """
    Evaluate candidate models using stratified k-fold cross-validation.

    Returns DataFrame with model name, mean scores, and standard deviations.
    """
    models = get_candidate_models()
    cv = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)

    results = []
    for name, model in models.items():
        print(f"  Evaluating {name}...")
        scores = cross_validate(
            model, X_train, y_train, cv=cv,
            scoring=["f1", "precision", "recall", "roc_auc"],
            n_jobs=-1,
        )
        results.append({
            "model": name,
            "f1_mean": scores["test_f1"].mean(),
            "f1_std": scores["test_f1"].std(),
            "precision_mean": scores["test_precision"].mean(),
            "precision_std": scores["test_precision"].std(),
            "recall_mean": scores["test_recall"].mean(),
            "recall_std": scores["test_recall"].std(),
            "roc_auc_mean": scores["test_roc_auc"].mean(),
            "roc_auc_std": scores["test_roc_auc"].std(),
        })

    results_df = pd.DataFrame(results).sort_values("f1_mean", ascending=False)
    print("\nCandidate model comparison:")
    print(results_df.to_string(index=False))
    return results_df


def train_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    model_name: str | None = None,
) -> tuple[Any, StandardScaler, str, pd.DataFrame]:
    """
    Train the selected model on the full training set.

    If model_name is None, selects the best from cross-validation.
    Returns (trained_model, scaler, selected_model_name, candidate_comparison_df).
    """
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    results_df = evaluate_candidates(X_scaled, y_train)
    if model_name is None:
        model_name = results_df.iloc[0]["model"]
        print(f"\nSelected: {model_name}")

    models = get_candidate_models()
    model = models[model_name]
    model.fit(X_scaled, y_train)

    return model, scaler, model_name, results_df


def predict(
    model: Any,
    scaler: StandardScaler,
    X: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate predictions and probability scores.

    Returns (predictions, probabilities).
    """
    X_scaled = scaler.transform(X)
    predictions = model.predict(X_scaled)
    probabilities = model.predict_proba(X_scaled)[:, 1]
    return predictions, probabilities


def get_feature_importance(
    model: Any,
    feature_names: list[str],
    top_n: int = 20,
) -> pd.DataFrame:
    """Extract feature importance from the trained model."""
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    elif hasattr(model, "coef_"):
        importances = np.abs(model.coef_[0])
    else:
        return pd.DataFrame({"feature": feature_names, "importance": 0})

    fi = pd.DataFrame({
        "feature": feature_names,
        "importance": importances,
    }).sort_values("importance", ascending=False)

    return fi.head(top_n)


def save_model(
    model: Any,
    scaler: StandardScaler,
    model_name: str,
    feature_names: list[str],
    metrics: dict,
    output_dir: str = "models/artifacts",
    version: str = "v1",
) -> str:
    """Save model, scaler, and metadata to disk."""
    path = Path(output_dir)
    path.mkdir(parents=True, exist_ok=True)

    joblib.dump(model, path / f"model_{version}.joblib")
    joblib.dump(scaler, path / f"scaler_{version}.joblib")

    metadata = {
        "model_name": model_name,
        "version": version,
        "feature_names": feature_names,
        "metrics": metrics,
    }
    with open(path / f"metadata_{version}.json", "w") as f:
        json.dump(metadata, f, indent=2, default=str)

    print(f"Model saved to {path}")
    return str(path)


def load_model(
    model_dir: str = "models/artifacts",
    version: str = "v1",
) -> tuple[Any, StandardScaler, dict]:
    """Load a saved model, scaler, and metadata."""
    path = Path(model_dir)
    model = joblib.load(path / f"model_{version}.joblib")
    scaler = joblib.load(path / f"scaler_{version}.joblib")

    with open(path / f"metadata_{version}.json") as f:
        metadata = json.load(f)

    return model, scaler, metadata
