"""Unit tests for ML modules."""

import sys
from pathlib import Path

# Ensure ML package root is on path
_ML_ROOT = Path(__file__).resolve().parent.parent
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

import numpy as np
import pandas as pd
from src.data.synthetic import generate_synthetic_dataset, GeneratorConfig
from src.features.engineering import build_feature_matrix, get_feature_columns
from src.graph.analysis import build_entity_graph, detect_communities, find_suspicious_clusters
from src.anomaly_detection.isolation_forest import train_anomaly_detector, predict_anomaly_scores
from src.models.risk_model import train_model, predict
from src.evaluation.metrics import evaluate_predictions, CostConfig
from src.fraud_spike.detector import FraudSpikeDetector
from src.chargeback.intelligence import ChargebackIntelligence
from src.return_risk.analyzer import ReturnRiskAnalyzer


def test_synthetic_data_generation():
    cfg = GeneratorConfig(
        num_merchants=2,
        num_customers=50,
        num_transactions=200,
        abuse_ring_count=2,
        abuse_ring_size_range=(3, 6),
        date_range_days=10,
        random_seed=123,
        output_dir="data/test_tmp",
    )
    dataset = generate_synthetic_dataset(cfg)
    assert "transactions" in dataset
    assert "customers" in dataset
    assert "graph_relationships" in dataset
    assert len(dataset["transactions"]) == 200
    assert dataset["customers"]["is_abuse_ring"].sum() > 0


def test_graph_community_detection():
    rels = pd.DataFrame([
        {"source_type": "customer", "source_id": "c1", "target_type": "device", "target_id": "d1", "relationship": "uses_device", "weight": 1.0},
        {"source_type": "customer", "source_id": "c2", "target_type": "device", "target_id": "d1", "relationship": "uses_device", "weight": 1.0},
        {"source_type": "customer", "source_id": "c3", "target_type": "device", "target_id": "d1", "relationship": "uses_device", "weight": 1.0},
        {"source_type": "customer", "source_id": "c1", "target_type": "ip_address", "target_id": "ip1", "relationship": "uses_ip", "weight": 1.0},
        {"source_type": "customer", "source_id": "c2", "target_type": "ip_address", "target_id": "ip1", "relationship": "uses_ip", "weight": 1.0},
    ])
    G = build_entity_graph(rels)
    assert G.number_of_nodes() > 0
    communities = detect_communities(G)
    assert len(communities) > 0


def test_feature_matrix_generation():
    n = 100
    features = pd.DataFrame({
        "customer_id": [f"c_{i}" for i in range(n)],
        "merchant_id": ["m_1"] * n,
        "is_abuse_ring": [1 if i < 10 else 0 for i in range(n)],
        "ring_id": [1 if i < 10 else -1 for i in range(n)],
        "tx_count": np.random.randint(1, 50, n),
        "total_amount": np.random.uniform(100, 50000, n),
        "avg_amount": np.random.uniform(50, 5000, n),
        "failed_tx_ratio": np.random.uniform(0, 0.5, n),
        "disputed_tx_ratio": np.random.uniform(0, 0.3, n),
        "device_count": np.random.randint(1, 4, n),
        "ip_count": np.random.randint(1, 5, n),
        "payment_method_count": np.random.randint(1, 3, n),
        "customer_degree": np.random.randint(2, 10, n),
        "community_size": np.random.randint(1, 8, n),
        "community_density": np.random.uniform(0.1, 1.0, n),
        "device_sharing_ratio": np.random.uniform(0, 0.8, n),
        "ip_sharing_ratio": np.random.uniform(0, 0.8, n),
        "pm_sharing_ratio": np.random.uniform(0, 0.8, n),
        "burst_ratio_1h": np.random.uniform(0, 1.0, n),
        "burst_ratio_6h": np.random.uniform(0, 1.0, n),
        "night_tx_ratio": np.random.uniform(0, 0.5, n),
    })
    feature_cols = [c for c in features.columns if c not in ["customer_id", "merchant_id", "is_abuse_ring", "ring_id"]]
    assert len(feature_cols) > 0


def test_isolation_forest_anomaly_detection():
    np.random.seed(42)
    X = np.random.randn(100, 10)
    detector = train_anomaly_detector(X, contamination=0.1)
    scores = predict_anomaly_scores(detector, X)
    assert len(scores) == 100
    assert (scores >= 0).all() and (scores <= 1).all()


def test_risk_model_training_and_prediction():
    np.random.seed(42)
    X = pd.DataFrame(np.random.randn(200, 15), columns=[f"f_{i}" for i in range(15)])
    y = pd.Series(np.random.choice([0, 1], size=200, p=[0.9, 0.1]))
    model, scaler, model_name, results_df = train_model(X.values, y.values, model_name="logistic_regression")
    preds, probs = predict(model, scaler, X.values)
    assert len(probs) == 200
    assert (probs >= 0).all() and (probs <= 1).all()
    assert model_name == "logistic_regression"
