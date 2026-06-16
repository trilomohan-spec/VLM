import { useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { ServerSettings } from "./ServerSettings";
import { getServerUrl } from "@/lib/ocr";

export function AppShell() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>

      {/* ── Header ── */}
      <header
        className="shrink-0 border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/cat-logo.png"
              alt="CAT"
              className="h-10 w-auto object-contain rounded-md"
            />
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-wide">EZI</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Serial Number Recognition System
              </div>
            </div>
          </div>

          {/* Settings icon with connection dot */}
          <button
            onClick={() => setShowSettings(true)}
            className="relative p-2 rounded-lg hover:bg-secondary"
          >
            <Settings className="h-5 w-5 text-muted-foreground" />
            {/* Green dot = backend configured */}
            <span
              className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${
                getServerUrl() ? "bg-emerald-400" : "bg-muted-foreground/40"
              }`}
            />
          </button>
        </div>
        <div className="h-1 stripes opacity-80" />
      </header>

      {/* ── Main scrollable content ── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer
        className="shrink-0 sticky bottom-0 z-30 border-t border-border bg-card/90 backdrop-blur flex items-center justify-center gap-2 py-2 px-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
          Powered by
        </span>
        <img
          src="/trilo-logo.png"
          alt="Trilo Automation"
          className="w-auto object-contain"
          style={{ height: "52px" }}
        />
        <span className="text-[10px] text-muted-foreground">|</span>
        <span className="text-[10px] font-semibold tracking-wide text-foreground whitespace-nowrap">
          Trilo Automation
        </span>
      </footer>

      {/* ── Server Settings sheet ── */}
      {showSettings && <ServerSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}