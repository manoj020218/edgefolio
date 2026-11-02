'use strict';
/**
 * Request timing kept in a small fixed-size window — enough to report the median and p95 response
 * time on /health, which is how we spot the shared VPS running out of headroom (move trigger:
 * median punch response over 500 ms at the morning peak, plan §10). Nothing here is needed to
 * serve requests, so a restart that clears it is harmless (the API stays stateless).
 */
const WINDOW = 500;

function createMetrics() {
  const samples = [];
  let total = 0;
  let slow = 0;

  function record(ms, slowThresholdMs) {
    samples.push(ms);
    if (samples.length > WINDOW) samples.shift();
    total++;
    if (ms >= slowThresholdMs) slow++;
  }

  function pct(sorted, p) {
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  }

  function snapshot() {
    const sorted = samples.slice().sort((a, b) => a - b);
    return {
      requests: total,
      slowRequests: slow,
      windowSize: sorted.length,
      medianMs: pct(sorted, 50),
      p95Ms: pct(sorted, 95),
    };
  }

  return { record, snapshot };
}

module.exports = { createMetrics };
