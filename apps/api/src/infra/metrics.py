"""Prometheus-compatible metrics for the assessment grading system.

Exposes counters and histograms for submission throughput, latency,
code execution performance, and event bus health.

Usage:
    from src.infra.metrics import METRICS

    METRICS.submission_total.labels(assessment_type="QUIZ", status="GRADED").inc()
    METRICS.grading_latency.labels(assessment_type="QUIZ", stage="grade").observe(0.142)
"""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass, field


@dataclass
class Counter:
    """Simple counter metric."""

    name: str
    _values: dict[tuple, float] = field(default_factory=lambda: defaultdict(float))

    def labels(self, **kwargs: str) -> _LabeledCounter:
        return _LabeledCounter(self, tuple(sorted(kwargs.items())))

    def inc(self, labels: tuple = (), amount: float = 1.0) -> None:
        self._values[labels] += amount

    def get(self, labels: tuple = ()) -> float:
        return self._values[labels]

    def collect(self) -> list[dict]:
        return [{"labels": dict(k), "value": v} for k, v in self._values.items()]


@dataclass
class _LabeledCounter:
    _counter: Counter
    _labels: tuple

    def inc(self, amount: float = 1.0) -> None:
        self._counter.inc(self._labels, amount)


@dataclass
class Histogram:
    """Simple histogram metric (stores observations for percentile calculation)."""

    name: str
    _observations: dict[tuple, list[float]] = field(default_factory=lambda: defaultdict(list))

    def labels(self, **kwargs: str) -> _LabeledHistogram:
        return _LabeledHistogram(self, tuple(sorted(kwargs.items())))

    def observe(self, value: float, labels: tuple = ()) -> None:
        self._observations[labels].append(value)

    def collect(self) -> list[dict]:
        results = []
        for labels, observations in self._observations.items():
            if not observations:
                continue
            sorted_obs = sorted(observations)
            results.append({
                "labels": dict(labels),
                "count": len(sorted_obs),
                "sum": sum(sorted_obs),
                "p50": sorted_obs[len(sorted_obs) // 2],
                "p99": sorted_obs[int(len(sorted_obs) * 0.99)],
            })
        return results


@dataclass
class _LabeledHistogram:
    _histogram: Histogram
    _labels: tuple

    def observe(self, value: float) -> None:
        self._histogram.observe(value, self._labels)

    @contextmanager
    def time(self) -> Generator[None]:
        start = time.perf_counter()
        yield
        self.observe(time.perf_counter() - start)


class MetricsRegistry:
    """Application metrics registry."""

    def __init__(self) -> None:
        self.submission_total = Counter("grading_submission_total")
        self.grading_latency = Histogram("grading_latency_seconds")
        self.auto_score = Histogram("grading_auto_score")
        self.code_execution_duration = Histogram("code_execution_duration_seconds")
        self.code_execution_degraded_total = Counter("code_execution_degraded_total")
        self.lifecycle_transition_total = Counter("assessment_lifecycle_transition_total")
        self.event_bus_dispatch_total = Counter("event_bus_dispatch_total")

    def collect_all(self) -> dict:
        """Collect all metrics for the /internal/metrics endpoint."""
        return {
            "grading_submission_total": self.submission_total.collect(),
            "grading_latency_seconds": self.grading_latency.collect(),
            "grading_auto_score": self.auto_score.collect(),
            "code_execution_duration_seconds": self.code_execution_duration.collect(),
            "code_execution_degraded_total": self.code_execution_degraded_total.collect(),
            "assessment_lifecycle_transition_total": self.lifecycle_transition_total.collect(),
            "event_bus_dispatch_total": self.event_bus_dispatch_total.collect(),
        }


METRICS = MetricsRegistry()
