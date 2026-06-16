import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHistory } from "@/lib/history";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { items } = useHistory();
  const stats = useMemo(() => {
    const total = items.length;
    const corrected = items.filter((i) => i.corrected).length;
    const avgConf = total ? items.reduce((a, b) => a + b.confidence, 0) / total : 0;
    const successPct = total
      ? (items.filter((i) => i.confidence >= 70 && !i.corrected).length / total) * 100
      : 0;
    const correctedPct = total ? (corrected / total) * 100 : 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      days.push({
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        count: items.filter((s) => s.createdAt >= d.getTime() && s.createdAt < next.getTime())
          .length,
      });
    }
    return { total, corrected, avgConf, successPct, correctedPct, days };
  }, [items]);

  const max = Math.max(1, ...stats.days.map((d) => d.count));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total scans" value={stats.total} />
        <Stat label="Avg confidence" value={`${Math.round(stats.avgConf)}%`} />
        <Stat label="OCR success" value={`${Math.round(stats.successPct)}%`} />
        <Stat label="Corrected" value={`${Math.round(stats.correctedPct)}%`} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary mb-3">
          Last 7 days
        </div>
        <div className="flex items-end gap-3 h-40">
          {stats.days.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-primary rounded-t-md transition-all"
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: 4 }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground">{d.day}</div>
              <div className="text-xs font-semibold">{d.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border text-sm font-semibold">Recent scans</div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No scans yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.slice(0, 8).map((s) => (
              <li key={s.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="mono font-bold truncate">{s.serial}</div>
                  <div className="mono text-xs text-muted-foreground truncate">
                    {s.part}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(s.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}