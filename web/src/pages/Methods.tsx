import { PageHeader } from '../components/Layout'

function Box({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-line bg-page px-4 py-3">
      <p className="text-[12.5px] font-semibold text-ink">{title}</p>
      <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

const Arrow = () => (
  <div className="flex items-center justify-center text-[18px] text-muted lg:rotate-0">↓</div>
)

export function Methods() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="How this was built"
        kicker="Workbench · methods & candor"
        accent="var(--s7)"
        lede="The point of this project is the analyst workflow end to end: a reproducible Python pipeline, real SQL for every number on screen, and findings written as decisions rather than dashboards. Here is the architecture, and — just as deliberately — its limitations."
      />

      <section className="rounded-xl border border-line bg-surface p-5">
        <h3 className="text-[15px] font-semibold text-ink">Architecture</h3>
        <div className="mt-4 grid gap-2">
          <Box
            title="generate_data.py  ·  pandas + numpy, seeded"
            items={[
              '25,000 orders / 12 months · 8,600 customers · seasonality + heavy-tailed activity',
              '6 injected fraud archetypes with distinct statistical signatures',
              '8,000 support contacts — lockout contacts generated from the orders the baseline rule actually blocks',
            ]}
          />
          <Arrow />
          <Box
            title="features.py  ·  feature engineering + transparent scoring"
            items={[
              'Trailing-24h velocity (two-pointer window), device decline counts, accounts-per-device, payment-instrument entropy, amount z-scores, prior refunds',
              'Risk score = 100·sigmoid(Σ wᵢfᵢ + b): hand-set weights, documented, decomposable — no trained model',
              'Exports scored parquet (~1.3 MB) + meta.json to the web app',
            ]}
          />
          <Arrow />
          <Box
            title="Browser  ·  Vite + React + DuckDB-WASM"
            items={[
              'Parquet loaded into an in-browser DuckDB at startup; every chart runs a real SQL query against it',
              'The “View SQL” string on each card is the executed query, not documentation',
              'Static bundle — no server, no API keys; deploys identically to GitHub Pages and Vercel',
            ]}
          />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 text-[13.5px] leading-relaxed text-ink-2">
        <h3 className="text-[15px] font-semibold text-ink">Why DuckDB-WASM</h3>
        <p className="mt-2 max-w-prose">
          The honest reason: credibility. A portfolio dashboard with precomputed JSON proves you can call a charting
          library. Shipping the actual database means every claim is auditable — toggle “View SQL” on any chart, paste
          it into the workbench, get the same numbers. It also happens to be a genuinely good architecture for
          analytical apps of this size: columnar execution over 25k rows returns in single-digit milliseconds, works
          offline, and costs nothing to host.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 text-[13.5px] leading-relaxed text-ink-2">
        <h3 className="text-[15px] font-semibold text-ink">Honest limitations</h3>
        <ul className="mt-2 max-w-prose list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-ink">The data is synthetic and the archetypes are injected.</span> Real
            fraud does not announce its ground truth, class balance (~9% here) is far worse in production, and my
            generator's fraudsters are only as creative as I made them. Detection results against your own injected
            patterns are an upper bound, not a benchmark.
          </li>
          <li>
            <span className="font-medium text-ink">The risk score is deliberately simple.</span> Hand-set weights on
            engineered features — transparent and explainable, but it will not generalize like a trained model, and
            friendly fraud (0% caught) shows exactly where rules run out.
          </li>
          <li>
            <span className="font-medium text-ink">Features are computed with full-dataset hindsight.</span>{' '}
            Accounts-per-device and payment entropy are global aggregates; a production system computes them
            point-in-time on streams, where late-arriving data and clock skew make this genuinely hard.
          </li>
          <li>
            <span className="font-medium text-ink">Contact attribution is generatively clean.</span> Lockout contacts
            link perfectly to their blocking order because I generated them that way. Real attribution is fuzzy joins
            over timestamps, text classification, and confidence intervals — the 50% contact rate here would be an
            estimate with error bars, not a fact.
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 text-[13.5px] leading-relaxed text-ink-2">
        <h3 className="text-[15px] font-semibold text-ink">Where this hands off to machine learning</h3>
        <p className="mt-2 max-w-prose">
          The transparent rule score is deliberately the floor, not the ceiling — and knowing where
          it stops is part of the analysis. If this were handed to an ML team tomorrow, the package
          is already sitting in this repo:
        </p>
        <ul className="mt-2 max-w-prose list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-ink">A labeled dataset with lineage:</span> 25k orders
            with ground-truth labels, plus the generator that produced them — so class balance,
            leakage risks, and label caveats are inspectable rather than tribal knowledge.
          </li>
          <li>
            <span className="font-medium text-ink">Feature definitions with rationale:</span> every
            engineered feature (velocity windows, device entropy, linkage counts) is documented with
            the fraud economics it encodes — the analyst's main contribution to a modeling effort,
            since features built from how the abuse works transfer; correlations don't.
          </li>
          <li>
            <span className="font-medium text-ink">An evaluation harness with a business axis:</span>{' '}
            the decisioning simulator is precision/recall against dollars and support contacts, not
            abstract AUC — any candidate model can be dropped onto the same axes the rules use today.
          </li>
          <li>
            <span className="font-medium text-ink">A map of where rules fail:</span> the score catches
            velocity-and-linkage fraud (~95% of card testing) and structurally misses longitudinal
            patterns — refund abuse (1.4%) and friendly fraud (0%). That is the model's mandate in one
            sentence: learn the patterns that only exist across orders, not within one.
          </li>
        </ul>
        <p className="mt-2 max-w-prose">
          What stays with the analyst either way: threshold policy, the review-queue design, the
          false-positive budget, and monitoring — a model changes who computes the score, not who
          owns the decision.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5 text-[13.5px] leading-relaxed text-ink-2">
        <h3 className="text-[15px] font-semibold text-ink">What a production version needs</h3>
        <ul className="mt-2 max-w-prose list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-ink">Streaming features:</span> the trailing-24h counts computed here in
            batch become stateful stream aggregations with strict point-in-time correctness.
          </li>
          <li>
            <span className="font-medium text-ink">A human review queue:</span> the simulator shows why — no threshold
            setting eliminates the precision/recall trade-off. The gray zone between auto-approve and auto-block needs
            trained reviewers, queue SLAs, and decision capture that feeds back into features.
          </li>
          <li>
            <span className="font-medium text-ink">Model monitoring:</span> score-distribution drift, feature-null
            alarms, and champion/challenger evaluation against delayed chargeback labels (the truth arrives 60–90 days
            late).
          </li>
          <li>
            <span className="font-medium text-ink">Shared fraud + CX metrics:</span> the single most transferable idea
            in this project — “contacts per 1,000 blocked orders” on one dashboard both teams own, so false-positive
            cost is nobody's externality.
          </li>
        </ul>
      </section>
    </div>
  )
}
