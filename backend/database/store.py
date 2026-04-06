"""Backward-compatible wrappers around the MongoDB repository module."""

from __future__ import annotations

from typing import Any

from .mongodb import get_result, list_results, save_result

__all__ = ["save_result", "get_result", "list_results", "Any"]