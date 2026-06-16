import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trash2, Download, Search, Database, Loader2 } from "lucide-react";
import { deleteScan, exportCsv, exportTrainingData, useHistory, type ScanRecord } from "@/lib/history";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { items, reload } = useHistory();
  const [q, setQ] = useState("");
  const [exportingZip, setExportingZip] = useState(false);

  const filtered = useMemo(() => {
    const n = q.trim().toUpperCase();
    if (!n) return items;
    return items.filter(
      (i) => i.serial.toUpperCase().includes(n) || i.part.toUpperCase().includes(n),
    );
  }, [q, items]);

  // The labeled subset for training: only scans that have both an image and
  // a confirmed correct value. We use *all* saved scans (not just `corrected`)
  // since by saving, the user has signed off on the final text — even if the
  // original OCR happened to be right.
  const trainable = useMemo(
    () => filtered.filter((s: ScanRecord) => !!s.imageDataUrl && (s.serial || s.part)),
    [filtered],
  );

  function download() {
    const csv = exportCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scans-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadTrainingZip() {
    if (trainable.length === 0) {
      alert("No labeled scans with images available yet.");
      return;
    }
    setExportingZip(true);
    try {
      const blob = await exportTrainingData(trainable);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `training-data-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message || err}`);
    } finally {
      setExportingZip(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-2xl font-bold">Scan history</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={downloadTrainingZip}
            disabled={exportingZip || trainable.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              trainable.length === 0
                ? "Save some scans first — images + labels are needed"
                : `Export ${trainable.length} labeled image${trainable.length === 1 ? "" : "s"} for OCR fine-tuning`
            }
          >
            {exportingZip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {exportingZip ? "Packing…" : `Export training data (${trainable.length})`}
          </button>
          <button
            onClick={download}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-secondary text-sm"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by serial or part number"
          className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-lg focus:outline-none focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No scans yet. Capture a plate from the Scan tab.
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Serial</th>
                <th className="px-4 py-3">Part</th>
                <th className="px-4 py-3">Conf.</th>
                <th className="px-4 py-3">Corrected</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 mono font-semibold">{s.serial}</td>
                  <td className="px-4 py-3 mono">{s.part}</td>
                  <td className="px-4 py-3">{Math.round(s.confidence)}%</td>
                  <td className="px-4 py-3">
                    {s.corrected ? (
                      <span className="text-primary text-xs uppercase tracking-wider">yes</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">no</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        deleteScan(s.id);
                        reload();
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-400"
                      title="Delete this scan"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
