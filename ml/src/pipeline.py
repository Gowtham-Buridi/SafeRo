# pyright: reportMissingImports=false, reportMissingModuleSource=false
"""
SafeRo End-to-End ML Pipeline Orchestrator.

Orchestrates:
1. Synthetic Data Generation
2. Graph Network Construction & Louvain Community Detection
3. Comprehensive Feature Engineering (Behavioral + Velocity + Graph + Sharing)
4. Strict Train / Validation / Held-Out Test Splits
5. Isolation Forest Anomaly Scoring
6. Supervised Risk Classification (Candidate Model Selection)
7. Isotonic Probability Calibration
8. Honest Evaluation on Held-Out Test Set with Business Cost Matrix
9. Model and Artifact Persistence
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data.synthetic import generate_synthetic_dataset, GeneratorConfig
from src.data.loader import create_splits
from src.features.engineering import build_feature_matrix, get_feature_columns
from src.graph.analysis import build_entity_graph, detect_communities, find_suspicious_clusters, compute_graph_features
from src.anomaly_detection.isolation_forest import train_anomaly_detector, predict_anomaly_scores
from src.models.risk_model import train_model, predict, save_model, get_feature_importance
from src.calibration.calibrator import calibrate_model, evaluate_calibration
from src.evaluation.metrics import evaluate_predictions, save_evaluation_report, CostConfig


def run_pipeline():
    print("=" * 60)
    print("SafeRo Risk Intelligence — ML Pipeline Execution")
    print("=" * 60)

    # 1. Generate Synthetic Data
    print("\n[Step 1/8] Generating realistic synthetic dataset...")
    config = GeneratorConfig(
        num_merchants=10,
        num_customers=1500,
        num_transactions=25000,
        abuse_ring_count=8,
        abuse_ring_size_range=(4, 12),
        date_range_days=60,
        random_seed=42,
        output_dir="data/generated",
    )
    raw_data = generate_synthetic_dataset(config)
    transactions = raw_data["transactions"]
    graph_rels = raw_data["graph_relationships"]
    customers = raw_data["customers"]

    # 2. Graph Construction & Community Detection
    print("\n[Step 2/8] Building entity relationship graph & detecting abuse rings...")
    G = build_entity_graph(graph_rels)
    communities = detect_communities(G)
    suspicious_clusters = find_suspicious_clusters(G, communities, min_customers=3)
    print(f"  Graph Nodes: {G.number_of_nodes()}, Edges: {G.number_of_edges()}")
    print(f"  Detected {len(suspicious_clusters)} candidate abuse clusters")

    # 3. Graph Feature Extraction
    print("\n[Step 3/8] Computing graph centrality and community features...")
    customer_ids = customers["customer_id"].tolist()
    graph_feats = compute_graph_features(G, communities, customer_ids)

    # 4. Feature Matrix Engineering
    print("\n[Step 4/8] Computing behavioral, velocity, and sharing features...")
    base_feats = build_feature_matrix(transactions, compute_velocity=True)
    full_feats = base_feats.merge(graph_feats, on="customer_id", how="left").fillna(0)

    feature_cols = get_feature_columns(full_feats)
    print(f"  Total Customer Instances: {len(full_feats)}")
    print(f"  Engineered Feature Columns: {len(feature_cols)}")

    # 5. Strict Train / Val / Test Split
    print("\n[Step 5/8] Creating stratified Train (60%), Val (20%), Held-Out Test (20%) splits...")
    train_df, val_df, test_df = create_splits(
        full_feats,
        train_ratio=0.6,
        val_ratio=0.2,
        test_ratio=0.2,
        random_seed=42,
        stratify_col="is_abuse_ring",
    )

    X_train = train_df[feature_cols].values
    y_train = train_df["is_abuse_ring"].values.astype(int)

    X_val = val_df[feature_cols].values
    y_val = val_df["is_abuse_ring"].values.astype(int)

    X_test = test_df[feature_cols].values
    y_test = test_df["is_abuse_ring"].values.astype(int)

    # 6. Train Anomaly Detector (Unsupervised baseline)
    print("\n[Step 6/8] Training Isolation Forest anomaly detector...")
    iso_forest = train_anomaly_detector(X_train, contamination=0.08, random_state=42)
    val_anomaly_scores = predict_anomaly_scores(iso_forest, X_val)
    print(f"  Isolation Forest trained. Mean validation anomaly score: {val_anomaly_scores.mean():.3f}")

    # Train & Calibrate Supervised Risk Classifier
    print("\n[Step 7/8] Evaluating candidate models and training classifier...")
    model, scaler, selected_model_name, candidate_comp = train_model(X_train, y_train)

    X_train_scaled = scaler.transform(X_train)
    calibrated_model = calibrate_model(model, X_train_scaled, y_train, method="isotonic")

    # 8. Honest Evaluation on Strictly Held-Out Test Set
    print("\n[Step 8/8] Evaluating on STRICTLY HELD-OUT TEST SET...")
    X_test_scaled = scaler.transform(X_test)
    test_preds = calibrated_model.predict(X_test_scaled)
    test_probs = calibrated_model.predict_proba(X_test_scaled)[:, 1]

    cost_cfg = CostConfig(
        cost_per_false_positive=500.0,
        cost_per_false_negative=5000.0,
        cost_per_true_positive=100.0,
    )
    eval_report = evaluate_predictions(y_test, test_preds, test_probs, cost_cfg)

    # Calibration Evaluation
    calib_report = evaluate_calibration(y_test, test_probs)
    eval_report["calibration_brier_score"] = calib_report["brier_score"]

    print("\n" + "=" * 60)
    print("HELD-OUT TEST SET METRICS (NO FABRICATION):")
    print(f"  Model Selected:      {selected_model_name}")
    print(f"  Test Samples:        {eval_report['sample_size']}")
    print(f"  Precision:           {eval_report['precision']:.4f}")
    print(f"  Recall:              {eval_report['recall']:.4f}")
    print(f"  F1 Score:            {eval_report['f1']:.4f}")
    print(f"  ROC-AUC:             {eval_report['roc_auc']:.4f}")
    print(f"  PR-AUC:              {eval_report['pr_auc']:.4f}")
    print(f"  Brier Score:         {eval_report['calibration_brier_score']:.4f}")
    print(f"  Confusion Matrix:    TP={eval_report['confusion_matrix']['true_positives']}, FP={eval_report['confusion_matrix']['false_positives']}, FN={eval_report['confusion_matrix']['false_negatives']}, TN={eval_report['confusion_matrix']['true_negatives']}")
    print(f"  Estimated Net Savings: INR {eval_report['business_cost_analysis']['net_estimated_savings']:,.2f}")
    print("=" * 60)

    # Save artifacts
    save_model(
        calibrated_model, scaler, selected_model_name,
        feature_cols, eval_report, output_dir="ml/models/artifacts", version="v1"
    )
    save_evaluation_report(eval_report, "ml/models/artifacts/test_evaluation_report.json")

    # Keep API generated directory in sync
    api_gen_dir = Path("apps/api/src/data/generated")
    if api_gen_dir.exists():
        save_evaluation_report(eval_report, str(api_gen_dir / "evaluation_report.json"))

    # Save candidate comparison artifact
    comp_path = Path("ml/models/artifacts/candidate_model_comparison.json")
    comp_path.parent.mkdir(parents=True, exist_ok=True)
    candidate_comp.to_json(comp_path, orient="records", indent=2)
    print(f"Candidate comparison report saved to {comp_path}")
    if api_gen_dir.exists():
        candidate_comp.to_json(api_gen_dir / "candidate_model_comparison.json", orient="records", indent=2)

    # Feature importances
    fi = get_feature_importance(model, feature_cols, top_n=15)
    print("\nTop 15 Most Important Risk Features:")
    print(fi.to_string(index=False))

    print("\nML Pipeline completed successfully.")
    return eval_report


if __name__ == "__main__":
    run_pipeline()
