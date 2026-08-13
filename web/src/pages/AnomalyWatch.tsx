import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { PageHeader } from '../components/Layout'
import { AXIS_PROPS, TooltipShell } from '../components/charts'
import { useRows } from '../hooks/useQuery'
import { fmtInt, titleCase } from '../lib/format'
import { WEEKLY_ANOMALY, weekDetailQuery } from '../lib/queries'

type Week = {
  week_start: string
  contacts: number
  rolling_mean: number | null
  z_score: number | null
}

type Detail = {
  contact_reason: string
  contacts_this_week: number
  weekly_avg_prior_8w: number
  excess: number
}

const Z_THRESHOLD = 3

export function AnomalyWatch() {
  const { rows: weeks } = useRows<Week>(WEEKLY_ANOMALY)
  const anomalies = useMemo(
    () => weeks.filter((w) => w.z_score !== null && Math.abs(w.z_score) >= Z_THRESHOLD),
    [weeks],
  )
  const [selected, setSelected] = useState<string | null>(null)
  const detailSql = selected ? weekDetailQuery(selected) : null
  const { rows: detail } = useRows<Detail>(detailSql ?? 'SELECT 1 WHERE false')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Anomaly watch"
        lede="Weekly contact volume against an 8-week rolling mean, flagged at |z| ≥ 3 — all computed in SQL with window functions. Three weeks trip the alarm: two are what a naive z-score does with launch ramp and holiday seasonality, and one is a genuine incident. Click them and see which is which."
      />

      <ChartCard
        title="Weekly contact volume vs rolling baseline"
        subtitle={`Solid line: weekly contacts. Dashed: trailing 8-week mean. Flagged points exceed ${Z_THRESHOLD} standard deviations — click one for the reason-level breakdown.`}
        sql={WEEKLY_ANOMALY}
        footnote="The first eight weeks have no baseline yet (the window needs history) — an honest limitation of any rolling detector: it is blind at the start and slow to unlearn a shifted baseline."
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={weeks} margin={{ top: 10, right: 12, bottom: 0, left: -14 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="week_start"
              {...AXIS_PROPS}
              tickFormatter={(w: string) => w.slice(2, 7)}
              minTickGap={28}
            />
            <YAxis {...AXIS_PROPS} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const w = payload[0].payload as Week
                return (
                  <TooltipShell
                    title={`Week of ${w.week_start}`}
                    rows={[
                      { name: 'Contacts', value: fmtInt(w.contacts), color: 'var(--s1)' },
                      { name: 'Rolling mean', value: w.rolling_mean ? fmtInt(w.rolling_mean) : 'n/a' },
                      { name: 'z-score', value: w.z_score ?? 'n/a' },
                    ]}
                  />
                )
              }}
            />
            <Line type="monotone" dataKey="contacts" name="Contacts" stroke="var(--s1)" strokeWidth={2} dot={false} />
            <Line
              type="monotone"
              dataKey="rolling_mean"
              name="8-week mean"
              stroke="var(--muted)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
            />
            {anomalies.map((a) => (
              <ReferenceDot
                key={a.week_start}
                x={a.week_start}
                y={a.contacts}
                r={7}
                fill="var(--critical)"
                stroke="var(--surface)"
                strokeWidth={2}
                onClick={() => setSelected(a.week_start)}
                className="cursor-pointer"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        {anomalies.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            <span className="font-medium text-ink">Flagged:</span>
            {anomalies.map((a) => (
              <button
                key={a.week_start}
                onClick={() => setSelected(a.week_start)}
                className={`rounded-full border px-2.5 py-0.5 transition-colors ${
                  selected === a.week_start
                    ? 'border-transparent bg-[var(--critical)] text-white'
                    : 'border-line hover:text-ink'
                }`}
              >
                {a.week_start} · z = {a.z_score}
              </button>
            ))}
          </div>
        )}
      </ChartCard>

      {selected && detailSql && (
        <ChartCard
          title={`What spiked in the week of ${selected}`}
          subtitle="Each reason this week vs its own prior-8-week weekly average. The excess column is the incident signature."
          sql={detailSql}
          footnote="Root cause, for the record: a misconfigured SPRING50 promo threw errors at the payment step for five days — one defect, two contact categories, ~480 excess conversations. The point of anomaly detection is not the alarm; it is how fast you can get from the alarm to this table."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[12.5px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 font-medium">Reason</th>
                  <th className="py-1.5 text-right font-medium">This week</th>
                  <th className="py-1.5 text-right font-medium">Prior 8-wk avg</th>
                  <th className="py-1.5 text-right font-medium">Excess</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((d) => (
                  <tr key={d.contact_reason} className="border-t border-line text-ink-2">
                    <td className="py-1.5">{titleCase(d.contact_reason)}</td>
                    <td className="tnum py-1.5 text-right">{fmtInt(d.contacts_this_week)}</td>
                    <td className="tnum py-1.5 text-right">{d.weekly_avg_prior_8w}</td>
                    <td className="tnum py-1.5 text-right">
                      <span className={d.excess > 50 ? 'font-semibold text-[var(--critical)]' : ''}>
                        {d.excess > 0 ? '+' : ''}
                        {d.excess}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  )
}
