"""Bounded, deterministic factual validation for covered historical claims."""

from app.factual_guard.guard import FactualGuard
from app.factual_guard.registry import load_critical_fact_registry

__all__ = ["FactualGuard", "load_critical_fact_registry"]
