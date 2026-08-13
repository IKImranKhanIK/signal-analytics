import { useMemo, useState } from 'react'
import { ChartCard } from '../components/ChartCard'
import { PageHeader } from '../components/Layout'
import { useRows } from '../hooks/useQuery'
import { fmtInt, fmtPct, fmtUsd } from '../lib/format'
import { RING_DEVICES, RING_MEMBERS } from '../lib/queries'

type Device = {
  device_hash: string
  accounts: number
  instruments: number
  orders: number
  gross_usd: number
  fraud_pct: number
  avg_risk_score: number
}

type Member = {
  device_hash: string
  customer_id: string
  orders: number
  gross_usd: number
  is_fraud: number
}

/** Radial cluster: one device in the center, its accounts around it. */
function RingViz({ members, device }: { members: Member[]; device: string }) {
  const W = 300
  const R = 100
  const cx = W / 2
  const cy = 130
  return (
    <svg viewBox={`0 0 ${W} 260`} className="mx-auto w-full max-w-[320px]">
      {members.map((m, i) => {
        const angle = (2 * Math.PI * i) / members.length - Math.PI / 2
        const x = cx + R * Math.cos(angle)
        const y = cy + R * Math.sin(angle)
        return (
          <g key={m.customer_id}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--grid)" strokeWidth={1.5} />
            <circle
              cx={x}
              cy={y}
              r={Math.min(6 + m.orders, 14)}
              fill={m.is_fraud ? 'var(--s2)' : 'var(--s1)'}
              fillOpacity={0.85}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              <title>{`${m.customer_id} · ${m.orders} orders · $${m.gross_usd}`}</title>
            </circle>
          </g>
        )
      })}
      <rect x={cx - 13} y={cy - 13} width={26} height={26} rx={6} fill="var(--ink)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill="var(--surface)">⌂</text>
      <text x={cx} y={250} textAnchor="middle" fontSize={11} fill="var(--muted)">
        {device.slice(0, 16)}… · {members.length} accounts
      </text>
    </svg>
  )
}

export function Rings() {
  const { rows: devices } = useRows<Device>(RING_DEVICES)
  const { rows: members } = useRows<Member>(RING_MEMBERS)
  const topDevices = useMemo(() => [...new Set(members.map((m) => m.device_hash))], [members])
  const [active, setActive] = useState<string | null>(null)
  const activeDevice = active ?? topDevices[0]
  const activeMembers = members.filter((m) => m.device_hash === activeDevice)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ring detection"
        lede="Fraud rarely happens one account at a time. Devices shared by several accounts are the cheapest linkage signal there is — one GROUP BY away. The pair-level version (a true self-join) is in the SQL Workbench examples."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <ChartCard
          title="Devices hosting 3+ accounts"
          subtitle="Every device fingerprint shared by at least three customer accounts, with volume and ground-truth fraud share."
          sql={RING_DEVICES}
          footnote="Not every shared device is a ring: the sub-40% fraud rows toward the bottom are shared family computers and the occasional cyber-café pattern — which is exactly why account-per-device count alone should feed a score, not a hard block."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12.5px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 font-medium">Device</th>
                  <th className="py-1.5 text-right font-medium">Accounts</th>
                  <th className="py-1.5 text-right font-medium">Instruments</th>
                  <th className="py-1.5 text-right font-medium">Orders</th>
                  <th className="py-1.5 text-right font-medium">Gross</th>
                  <th className="py-1.5 text-right font-medium">Fraud share</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr
                    key={d.device_hash}
                    onClick={() => topDevices.includes(d.device_hash) && setActive(d.device_hash)}
                    className={`border-t border-line text-ink-2 ${
                      topDevices.includes(d.device_hash) ? 'cursor-pointer hover:bg-page' : ''
                    } ${d.device_hash === activeDevice ? 'bg-page' : ''}`}
                  >
                    <td className="py-1.5 font-mono text-[11.5px]">{d.device_hash.slice(0, 14)}…</td>
                    <td className="tnum py-1.5 text-right">{d.accounts}</td>
                    <td className="tnum py-1.5 text-right">{d.instruments}</td>
                    <td className="tnum py-1.5 text-right">{fmtInt(d.orders)}</td>
                    <td className="tnum py-1.5 text-right">{fmtUsd(d.gross_usd)}</td>
                    <td className="tnum py-1.5 text-right">
                      <span className={d.fraud_pct >= 80 ? 'font-semibold text-[var(--critical)]' : ''}>
                        {fmtPct(d.fraud_pct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title="Cluster view"
          subtitle="Accounts orbiting one shared device. Click a highlighted row to switch."
          sql={RING_MEMBERS}
        >
          {activeMembers.length > 0 && <RingViz members={activeMembers} device={activeDevice ?? ''} />}
          <div className="mt-2 flex justify-center gap-4 text-[12px] text-ink-2">
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--s2)]" />fraud account</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--s1)]" />legit account</span>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
