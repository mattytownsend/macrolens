# MacroLens Architecture

MacroLens deliberately separates calculation from presentation.

## 1. Data sources

The private engine collects economic and market data from sources such as FRED, CFTC, Yahoo Finance and Myfxbook, alongside manually verified macro inputs where a reliable automated feed is not available.

## 2. Private Python engine

The engine performs data cleaning, normalization, statistical transformations, weighted aggregation and scenario calculations. Credentials are loaded from environment variables and never sent to the browser.

## 3. JSON contract

The engine exports a structured `macrolens_output.json` file. This acts as the interface between the private analysis code and the public dashboard.

This design has two benefits:

- the frontend does not need credentials or direct access to private APIs;
- the analysis implementation can evolve without forcing the UI to understand every internal calculation.

## 4. Explainability layer

The output contract includes scores, classifications, ranked drivers, source health and definitions. The frontend turns these fields into deterministic plain-English explanations and interactive “Why this result?” views.

No language model is required to generate the explanations shown in the dashboard.

## 5. Frontend

The public interface uses HTML, CSS and JavaScript. It loads the sanitized JSON contract and renders the final USD bias, analytical signals, source status, architecture and methodology sections.

## Separation of concerns

```text
DATA INGESTION -> ANALYSIS ENGINE -> JSON CONTRACT -> EXPLAINABLE UI
```

The private engine owns calculation. The public frontend owns presentation. The JSON contract defines the boundary between them.
