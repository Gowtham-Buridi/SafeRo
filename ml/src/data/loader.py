"""
Data loading utilities with strict train/validation/test split enforcement.

The held-out test set must NEVER be used during training or hyperparameter tuning.
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split


def load_generated_data(data_dir: str = "data/generated") -> dict[str, pd.DataFrame]:
    """Load all generated CSVs into DataFrames."""
    path = Path(data_dir)
    if not path.exists():
        raise FileNotFoundError(
            f"Generated data directory not found: {path}. "
            "Run the synthetic data generator first."
        )

    files = [
        "merchants", "customers", "devices", "ip_addresses",
        "payment_methods", "transactions", "graph_relationships",
        "abuse_rings_truth",
    ]

    data = {}
    for name in files:
        filepath = path / f"{name}.csv"
        if filepath.exists():
            data[name] = pd.read_csv(filepath)
            if "created_at" in data[name].columns:
                data[name]["created_at"] = pd.to_datetime(data[name]["created_at"])
        else:
            print(f"Warning: {filepath} not found, skipping.")

    return data


def create_splits(
    transactions: pd.DataFrame,
    train_ratio: float = 0.6,
    val_ratio: float = 0.2,
    test_ratio: float = 0.2,
    random_seed: int = 42,
    stratify_col: str = "is_abuse_ring",
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Create stratified train/validation/test splits.

    The test set is STRICTLY held out and must not be used for training or tuning.
    Splits are stratified on the target column to maintain class balance.
    """
    assert abs(train_ratio + val_ratio + test_ratio - 1.0) < 1e-6, \
        f"Split ratios must sum to 1.0, got {train_ratio + val_ratio + test_ratio}"

    stratify = transactions[stratify_col] if stratify_col in transactions.columns else None

    # First split: separate test set
    train_val, test = train_test_split(
        transactions,
        test_size=test_ratio,
        random_state=random_seed,
        stratify=stratify,
    )

    # Second split: separate train and validation
    val_relative = val_ratio / (train_ratio + val_ratio)
    stratify_tv = train_val[stratify_col] if stratify_col in train_val.columns else None

    train, val = train_test_split(
        train_val,
        test_size=val_relative,
        random_state=random_seed,
        stratify=stratify_tv,
    )

    # Verify no leakage
    id_col = "customer_id" if "customer_id" in transactions.columns else "transaction_id"
    train_ids = set(train[id_col])
    val_ids = set(val[id_col])
    test_ids = set(test[id_col])

    assert len(train_ids & val_ids) == 0, "Train/val overlap detected!"
    assert len(train_ids & test_ids) == 0, "Train/test overlap detected!"
    assert len(val_ids & test_ids) == 0, "Val/test overlap detected!"

    print(f"Data splits created:")
    print(f"  Train:      {len(train)} ({train[stratify_col].mean():.3%} positive)")
    print(f"  Validation: {len(val)} ({val[stratify_col].mean():.3%} positive)")
    print(f"  Test:       {len(test)} ({test[stratify_col].mean():.3%} positive)")

    return train, val, test


def save_splits(
    train: pd.DataFrame,
    val: pd.DataFrame,
    test: pd.DataFrame,
    output_dir: str = "data/splits",
) -> None:
    """Save splits to CSV files."""
    path = Path(output_dir)
    path.mkdir(parents=True, exist_ok=True)
    train.to_csv(path / "train.csv", index=False)
    val.to_csv(path / "val.csv", index=False)
    test.to_csv(path / "test.csv", index=False)
    print(f"Splits saved to {path}")


def load_splits(data_dir: str = "data/splits") -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load pre-saved splits."""
    path = Path(data_dir)
    train = pd.read_csv(path / "train.csv")
    val = pd.read_csv(path / "val.csv")
    test = pd.read_csv(path / "test.csv")

    for df in [train, val, test]:
        if "created_at" in df.columns:
            df["created_at"] = pd.to_datetime(df["created_at"])

    return train, val, test
