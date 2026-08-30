"""SafeRo ML Service — Risk intelligence and abuse-ring detection."""

from pathlib import Path
import yaml


_CONFIG_PATH = Path(__file__).parent.parent / "config" / "config.yaml"
_config: dict | None = None


def get_config() -> dict:
    """Load and cache the ML configuration."""
    global _config
    if _config is None:
        with open(_CONFIG_PATH, "r") as f:
            _config = yaml.safe_load(f)
    return _config
