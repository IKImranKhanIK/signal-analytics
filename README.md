# Signal — Trust & Experience Analytics

A single-page analytics app that treats fraud prevention and customer experience as
two sides of the same customer. Built on a fully synthetic digital-goods store:
**25,000 orders with six injected fraud archetypes, and 8,000 support contacts that
trace back to what the fraud rules did.**

**Live demo:** GitHub Pages · Vercel *(links added on deploy)*

No server, no API keys — a Python pipeline generates the data, and DuckDB-WASM runs
real SQL in your browser.

## The 90-second tour

1. **Overview** — KPI row and the first finding: the rules catch 95% of card testing
   (worth ~$430) and barely 60% of laundering + account takeover (worth ~$96k).
2. Open **Pattern explorer**, click *Gift-card laundering*, and read the
   investigation memo under the scatter — what the pattern is, the exact feature that
   catches it, and what to do about it.
3. Press **View SQL** on any chart. That string is not documentation — it is the
   query that just produced the chart. Paste it into the **SQL workbench** and get
   the same numbers.
4. Open the **Decisioning simulator** and drag *Risk score* down to 40. Watch fraud
   caught rise — and watch the projected "account locked" support contacts rise with
   it. That projection is calibrated from the contact dataset itself: at baseline
   thresholds, 285 real lockout contacts trace to the rule's 494 false positives.
5. **Anomaly watch** flags three weeks; two are what naive z-scores do to growth and
   holidays, one is a seeded five-day promo incident. Click them and see which is
   which from the reason-level breakdown.

## Architecture

```
data-pipeline/generate_data.py   25k orders, 6 fraud archetypes, 8k contacts (seeded)
data-pipeline/features.py        velocity/entropy/linkage features + transparent risk score
        │
        ▼  parquet (~1.3 MB)
web/  Vite + React 18 + TS + Tailwind + Recharts
      DuckDB-WASM loads the parquet at startup; every chart is a live SQL query
```

Key design decisions, including honest limitations, are on the app's
**"How this was built"** page — the short version: the risk score is a transparent
weighted score (not a trained model), the data is synthetic and says so everywhere,
and detection results against self-injected patterns are an upper bound.

## Run it

**Web app** (data artifacts are committed, so this works immediately):

```bash
cd web && npm install && npm run dev
```

**Regenerate the dataset** (deterministic — same seed, same bytes):

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r data-pipeline/requirements.txt
python data-pipeline/generate_data.py
python data-pipeline/features.py
```

See [data-pipeline/README.md](data-pipeline/README.md) for why every distribution
looks the way it does.

## Deploy

- **GitHub Pages**: push to `main` — `.github/workflows/deploy.yml` builds and
  deploys. Enable Pages → "GitHub Actions" in repo settings once.
- **Vercel**: import the repo; `vercel.json` handles the monorepo layout (or set the
  project root to `web/` and use the Vite preset).

The bundle uses relative asset paths + hash routing, so the same build works at a
domain root and under a repo subpath, and refreshes never 404.

## What's deliberately absent

No login, no external APIs, no real ML training in the browser, and no resemblance
to any real company's data, branding, or internal terminology. The store, the
customers, and the fraudsters are all statistical fiction.
