# MacroLens Methodology Overview

This public methodology describes the structure of the system without publishing the complete private scoring implementation.

## First Underlying Dynamic — Macro Fundamentals

Converts labour-market, inflation, relative-rate and Federal Reserve policy data into a structured view of the US macro environment and its implications for the dollar.

The dashboard exposes four component signals:

- **LHI — Labour Heat Index**
- **IMS — Inflation Momentum Score**
- **RDS — Rate Differential Signal**
- **PES — Policy Expectation Score**

## Second Underlying Dynamic — Scenario & Yield Analysis

Tests whether yield spreads, carry, real-rate differentials and broader market conditions confirm or challenge the fundamental view, then updates the weighting of alternative macro scenarios.

The dashboard also exposes Bayesian scenario weights as context rather than presenting them as guaranteed event probabilities.

## Third Underlying Dynamic — Positioning & Market Context

Measures how institutional, retail and hedge-fund positioning is skewed around the USD and uses crowding as a conviction overlay.

Risk sentiment is displayed separately as supporting market context, while the crowding overlay is driven by USD positioning.

## Final output

The three underlying dynamics are combined into a normalized final USD bias. The public dashboard shows both each dynamic's own score and its contribution to the final result, while the exact private scoring implementation remains outside the public repository.

## Explainability

Each signal can be opened to inspect:

- the plain-English interpretation;
- ranked contributing inputs;
- observed values and definitions;
- source/data-quality status.

This explanation layer is deterministic and generated from the structured model output.
