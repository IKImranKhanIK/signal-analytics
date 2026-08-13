import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { KpiRow, KpiTile } from '../components/Kpi'
import { PageHeader } from '../components/Layout'
import { Memo } from '../components/Memo'
import { ARCHETYPE_COLOR, ARCHETYPE_LABEL, AXIS_PROPS, defaultTooltip } from '../components/charts'
import { useRows } from '../hooks/useQuery'
import { fmtCompact, fmtInt, fmtPct, fmtUsd } from '../lib/format'
import { ARCHETYPE_MIX, KPI_SUMMARY, MONTHLY_TREND, MONTHLY_VOLUME } from '../lib/queries'

type Kpis = {
  total_orders: number
  fraud_rate_pct: number
  chargeback_rate_pct: number
  fraud_exposure_usd: number
  rule_precision_pct: number
  rule_recall_pct: number
}

export function Overview() {
  const kpi = useRows<Kpis>(KPI_SUMMARY).rows[0]
  const trend = useRows<{ month: string; fraud_rate_pct: number; chargeback_rate_pct: number }>(MONTHLY_TREND).rows
  const volume = useRows<{ month: string; orders: number }>(MONTHLY_VOLUME).rows
  const mix = useRows<{ fraud_archetype: string; orders: number; exposure_usd: number; caught_by_rules_pct: number }>(ARCHETYPE_MIX).rows

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fraud intelligence · Overview"
        lede="Twelve months of a synthetic digital-goods storefront: subscriptions, in-app purchases, downloads and gift cards. Ground-truth fraud labels exist because the data is generated — which lets every rule and score be judged honestly."
      />

      <KpiRow>
        <KpiTile
          label="Fraud rate"
          value={kpi ? fmtPct(kpi.fraud_rate_pct) : '—'}
          detail={kpi ? `of ${fmtInt(kpi.total_orders)} orders` : undefined}
        />
        <KpiTile
          label="Chargeback rate"
          value={kpi ? fmtPct(kpi.chargeback_rate_pct) : '—'}
          detail="of approved orders"
        />
        <KpiTile
          label="Fraud $ exposure"
          value={kpi ? fmtUsd(kpi.fraud_exposure_usd) : '—'}
          detail="approved fraud, gross"
        />
        <KpiTile
          label="Rule precision"
          value={kpi ? fmtPct(kpi.rule_precision_pct) : '—'}
          detail={kpi ? `at ${fmtPct(kpi.rule_recall_pct)} recall` : undefined}
        />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Fraud & chargeback rate by month"
          subtitle="Share of orders labeled fraud, and chargebacks as a share of approved orders."
          sql={MONTHLY_TREND}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" {...AXIS_PROPS} tickFormatter={(m: string) => m.slice(2)} />
              <YAxis {...AXIS_PROPS} unit="%" />
              <Tooltip content={defaultTooltip((_k, v) => fmtPct(v, 2))} />
              <Line
                type="monotone"
                dataKey="fraud_rate_pct"
                name="Fraud rate"
                stroke="var(--s1)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="chargeback_rate_pct"
                name="Chargeback rate"
                stroke="var(--s2)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex gap-4 text-[12px] text-ink-2">
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--s1)]" />Fraud rate</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--s2)]" />Chargeback rate</span>
          </div>
        </ChartCard>

        <ChartCard
          title="Order volume by month"
          subtitle="Growth trend with a holiday-season peak — the denominator behind every rate."
          sql={MONTHLY_VOLUME}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={volume} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" {...AXIS_PROPS} tickFormatter={(m: string) => m.slice(2)} />
              <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => fmtCompact(v)} />
              <Tooltip content={defaultTooltip((_k, v) => fmtInt(v))} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
              <Bar dataKey="orders" name="Orders" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Fraud mix by archetype"
        subtitle="Order counts tell one story; dollar exposure tells another. Card testing dominates volume, but laundering and account takeover carry the money."
        sql={ARCHETYPE_MIX}
        footnote="“Caught” = blocked by the current baseline rule, judged against ground truth. Friendly fraud is invisible at order time by construction — see the pattern explorer."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={mix} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 40 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...AXIS_PROPS} tickFormatter={(v: number) => fmtCompact(v)} />
            <YAxis
              type="category"
              dataKey="fraud_archetype"
              width={118}
              {...AXIS_PROPS}
              tickFormatter={(a: string) => ARCHETYPE_LABEL[a] ?? a}
            />
            <Tooltip
              content={defaultTooltip((_k, v) => fmtInt(v))}
              cursor={{ fill: 'var(--grid)', opacity: 0.4 }}
            />
            <Bar dataKey="orders" name="Orders" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {mix.map((m) => (
                <Cell key={m.fraud_archetype} fill={ARCHETYPE_COLOR[m.fraud_archetype]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[440px] text-[12.5px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-medium">Archetype</th>
                <th className="py-1 text-right font-medium">Orders</th>
                <th className="py-1 text-right font-medium">$ exposure</th>
                <th className="py-1 text-right font-medium">Caught by rules</th>
              </tr>
            </thead>
            <tbody>
              {mix.map((m) => (
                <tr key={m.fraud_archetype} className="border-t border-line text-ink-2">
                  <td className="py-1.5">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ background: ARCHETYPE_COLOR[m.fraud_archetype] }}
                    />
                    {ARCHETYPE_LABEL[m.fraud_archetype]}
                  </td>
                  <td className="tnum py-1.5 text-right">{fmtInt(m.orders)}</td>
                  <td className="tnum py-1.5 text-right">{fmtUsd(m.exposure_usd)}</td>
                  <td className="tnum py-1.5 text-right">{fmtPct(m.caught_by_rules_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <Memo
        title="Where the fraud program actually stands"
        intro="Three findings from the twelve-month window, judged against ground truth. The theme: our rules are tuned for the loudest pattern, not the most expensive one — and the blocking we do has a customer-experience bill that shows up in the contact data, not here."
        findings={[
          {
            title: 'Rules catch the noise, not the money',
            evidence:
              'Card testing is 95% caught but represents only ~$430 of approved exposure. Gift-card laundering and account takeover carry ~$96k of the ~$106k total exposure, yet are caught at just 59–65%.',
            impact: 'Roughly $37k of high-value fraud clears the current rules each year.',
            action:
              'Add device-linkage features (accounts-per-device, payment entropy) to the blocking path for gift-card orders ≥ $100 — the ring-detection query already isolates these clusters.',
            priority: 'P0',
          },
          {
            title: 'False positives are a support-cost machine',
            evidence:
              'The baseline rule blocks 494 legitimate orders (27% of all blocks). 285 of those customers filed “account locked” contacts — a 58% contact rate, at ~8 minutes of agent handle time each.',
            impact:
              '~$14k of good revenue turned away, plus ~38 agent-hours, plus the churn risk on exactly the customers who spend the most (IAP whales and gift-card shoppers).',
            action:
              'Route velocity-only blocks to a step-up verification instead of a hard decline; the decisioning simulator quantifies the trade-off at any threshold.',
            priority: 'P1',
          },
          {
            title: 'Refund abuse and friendly fraud need a different tool',
            evidence:
              'Refund abuse is caught 1.4% of the time and friendly fraud 0% — both look legitimate at authorization. The signal only exists post-purchase (88% refund rate accumulating per account; chargebacks with no dispute history).',
            impact: '~$8k direct, plus refund-processing load visible in the contact data.',
            action:
              'Stand up a post-purchase review queue keyed on prior_refunds ≥ 2 and first-chargeback flags rather than trying to block at checkout.',
            priority: 'P2',
          },
        ]}
      />
    </div>
  )
}
