"""Tests for ML configuration loading."""

import sys
from pathlib import Path

# Ensure ML package root is on path
_ML_ROOT = Path(__file__).resolve().parent.parent
if str(_ML_ROOT) not in sys.path:
    sys.path.insert(0, str(_ML_ROOT))

from src import get_config
from src.data.synthetic import GeneratorConfig


def test_config_loads():
    """Config YAML loads without errors."""
    config = get_config()
    assert isinstance(config, dict)
    assert "data" in config
    assert "models" in config
    assert "evaluation" in config
    assert "graph" in config


def test_config_evaluation_section():
    """Evaluation config has required fields."""
    config = get_config()
    evaluation = config["evaluation"]
    assert evaluation["test_set_ratio"] == 0.2
    assert evaluation["stratified"] is True
    assert "precision" in evaluation["metrics"]
    assert "recall" in evaluation["metrics"]
    assert "false_positive_rate" in evaluation["metrics"]


def test_generator_config_defaults():
    """GeneratorConfig has sensible defaults."""
    gc = GeneratorConfig()
    assert gc.num_merchants == 10
    assert gc.num_customers == 2000
    assert gc.num_transactions == 50000
    assert gc.abuse_ring_count == 8
    assert gc.random_seed == 42


def test_config_graph_section():
    """Graph config has required fields."""
    config = get_config()
    graph = config["graph"]
    assert graph["min_cluster_size"] == 3
    assert graph["similarity_threshold"] == 0.7
