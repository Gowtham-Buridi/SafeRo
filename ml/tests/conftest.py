"""Pytest configuration and environment fixtures for SafeRo ML."""

import sys
from pathlib import Path

# Add ml root directory to sys.path
ml_root = Path(__file__).resolve().parent.parent
if str(ml_root) not in sys.path:
    sys.path.insert(0, str(ml_root))

src_root = ml_root / "src"
if str(src_root) not in sys.path:
    sys.path.insert(0, str(src_root))
