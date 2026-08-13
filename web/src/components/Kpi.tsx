export function KpiTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-[26px] font-semibold leading-none text-ink">{value}</p>
      {detail && <p className="mt-1.5 text-[12px] text-ink-2">{detail}</p>}
    </div>
  )
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
}
