import { useState, useEffect } from "react";
import { Wifi, WifiOff, CheckCircle, XCircle, Loader2, X } from "lucide-react";
import { getServerUrl, setServerUrl } from "@/lib/ocr";

type Status = "idle" | "testing" | "ok" | "fail";

export function ServerSettings({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(getServerUrl);
  const [status, setStatus] = useState<Status>("idle");
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => {
    if (getServerUrl()) runTest(getServerUrl());
  }, []);

  async function runTest(target: string) {
    const base = target.trim().replace(/\/$/, "");
    if (!base) return;
    setStatus("testing");
    setErrorDetail("");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    try {
      const r = await fetch(`${base}/health`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (r.ok) {
        setStatus("ok");
        setErrorDetail("");
      } else {
        setStatus("fail");
        setErrorDetail(`Server responded with status ${r.status}`);
      }
    } catch (e: unknown) {
      clearTimeout(timer);
      setStatus("fail");
      if (e instanceof Error) {
        if (e.name === "AbortError") {
          setErrorDetail("Timed out — server did not respond in 6 seconds");
        } else {
          setErrorDetail(e.message || "Network error");
        }
      } else {
        setErrorDetail("Unknown error");
      }
    }
  }

  function handleSave() {
    setServerUrl(url.trim());
    onClose();
  }

  function handleClear() {
    setUrl("");
    setServerUrl("");
    setStatus("idle");
    setErrorDetail("");
  }

  const isTesting = status === "testing";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-card border-t border-border rounded-t-2xl p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold">Backend Server</div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
              OCR Model Connection
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2">
          {status === "ok"
            ? <Wifi className="h-4 w-4 text-emerald-400" />
            : <WifiOff className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">
            {status === "ok"
              ? "Connected to backend model"
              : getServerUrl()
              ? "Not connected — using on-device OCR"
              : "No server configured — using on-device OCR"}
          </span>
        </div>

        {/* URL input */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">
            Server URL
          </label>
          <div className="flex gap-2 items-center bg-background border border-border rounded-lg px-3 py-3">
            <input
              value={url}
              onChange={(e) => { setUrl(e.target.value); setStatus("idle"); setErrorDetail(""); }}
              placeholder="http://192.168.1.100:8000"
              className="flex-1 bg-transparent text-sm focus:outline-none font-mono"
              style={{ userSelect: "text", WebkitUserSelect: "text" }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
            />
            {status === "testing" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
            {status === "ok"   && <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />}
            {status === "fail" && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
          </div>

          {/* Status message */}
          {status === "testing" && (
            <p className="text-xs text-muted-foreground">Testing {url.trim()}/health …</p>
          )}
          {status === "ok" && (
            <p className="text-xs text-emerald-400">Server reachable ✓</p>
          )}
          {status === "fail" && (
            <p className="text-xs text-red-400">
              {errorDetail || "Cannot reach server"}
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            Use <span className="font-mono">http://</span> and the IP of your RTX machine on the same Wi-Fi.
            Example: <span className="font-mono">http://192.168.1.45:8000</span>
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onPointerUp={handleClear}
            className="px-4 py-3 rounded-lg border border-border text-sm"
          >
            Clear
          </button>
          <button
            onPointerUp={() => runTest(url)}
            disabled={!url.trim() || isTesting}
            className="px-4 py-3 rounded-lg border border-border text-sm disabled:opacity-40"
          >
            {isTesting ? "Testing…" : "Test"}
          </button>
          <button
            onPointerUp={handleSave}
            className="flex-1 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
          >
            Save
          </button>
        </div>

        <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />
      </div>
    </div>
  );
}