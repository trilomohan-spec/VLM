import { useState, useEffect, ReactNode, ChangeEvent } from "react";

declare global {
  interface Window {
    ezilicense?: {
      getMachineId: () => Promise<string>;
      isLicensed: () => Promise<boolean>;
      activate: (key: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

interface LicenseGateProps {
  children: ReactNode;
}

/**
 * Wraps the app. On Electron, checks license on mount.
 * If not licensed, shows the activation screen instead of the app.
 * On web/Android (no window.ezilicense), renders children immediately.
 */
export function LicenseGate({ children }: LicenseGateProps) {
  const [status, setStatus]     = useState<"checking" | "licensed" | "unlicensed">("checking");
  const [machineId, setMachineId] = useState("");
  const [key, setKey]           = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    if (!window.ezilicense) {
      // Not running in Electron — skip license check (web / Android)
      setStatus("licensed");
      return;
    }
    (async () => {
      const [licensed, mid] = await Promise.all([
        window.ezilicense!.isLicensed(),
        window.ezilicense!.getMachineId(),
      ]);
      setMachineId(mid);
      setStatus(licensed ? "licensed" : "unlicensed");
    })();
  }, []);

  async function handleActivate() {
    if (!key.trim()) { setError("Please enter your license key."); return; }
    setLoading(true);
    setError("");
    const result = await window.ezilicense!.activate(key.trim());
    setLoading(false);
    if (result.success) {
      setStatus("licensed");
    } else {
      setError(result.error ?? "Activation failed.");
    }
  }

  function copyMachineId() {
    navigator.clipboard.writeText(machineId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Format key input as XXXX-XXXX-XXXX-XXXX
  function handleKeyInput(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const formatted = raw.match(/.{1,4}/g)?.join("-") ?? raw;
    setKey(formatted.slice(0, 19)); // max 16 chars + 3 dashes
  }

  if (status === "checking") {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Checking license…</div>
      </div>
    );
  }

  if (status === "licensed") {
    return <>{children}</>;
  }

  // ── Unlicensed screen ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <img src="./cat-logo.png" alt="CAT" className="h-10 w-auto object-contain rounded-md" />
        <div className="leading-tight">
          <div className="text-base font-bold tracking-wide">EZI</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Serial Number Recognition System
          </div>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-lg space-y-5">
        <div>
          <h1 className="text-lg font-semibold">Activate Your License</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This software requires a valid license key. Contact Trilo Automation to get your key.
          </p>
        </div>

        {/* Machine ID */}
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your Device ID
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs font-mono break-all select-all">
              {machineId || "Loading…"}
            </div>
            <button
              onClick={copyMachineId}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Send this Device ID to Trilo Automation to receive your license key.
          </p>
        </div>

        {/* License key input */}
        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            License Key
          </label>
          <input
            type="text"
            value={key}
            onChange={handleKeyInput}
            onKeyDown={(e) => e.key === "Enter" && handleActivate()}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            maxLength={19}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
          />
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>

        {/* Activate button */}
        <button
          onClick={handleActivate}
          disabled={loading || key.replace(/-/g, "").length < 16}
          className="w-full py-2.5 rounded-xl bg-yellow-400 text-black font-semibold text-sm
                     hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
        >
          {loading ? "Activating…" : "Activate"}
        </button>
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center gap-2 opacity-60">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Powered by</span>
        <img src="./trilo-logo.png" alt="Trilo Automation" className="h-8 w-auto object-contain" />
        <span className="text-[10px] text-muted-foreground">| Trilo Automation</span>
      </div>
    </div>
  );
}
