import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2, Printer, ScanLine, Zap } from "lucide-react";
import { runOcr, applyBusinessRules, type OcrResult } from "@/lib/ocr";
import { Barcode } from "@/components/Barcode";
import CropStep from "@/components/CropStep";

export const Route = createFileRoute("/")({
  component: Index,
});

// Added a "crop" phase between camera capture and OCR processing. The crop
// is the single biggest accuracy/speed win for embossed plate scanning.
// "partial" phase: scan found only serial OR only part — ask user to scan again.
type Phase = "idle" | "camera" | "crop" | "processing" | "partial" | "review";

function Index() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  // Full-frame photo we got from the camera/upload, BEFORE cropping.
  // Kept separate so the user can re-crop without re-shooting.
  const [rawDataUrl, setRawDataUrl] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [serial, setSerial] = useState("");
  const [part, setPart] = useState("");
  // Accumulated across multiple scans (persists until full reset)
  const [accSerial, setAccSerial] = useState("");
  const [accPart, setAccPart] = useState("");
  const [torch, setTorch] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    setPhase("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      alert("Camera unavailable. You can upload an image instead.");
      setPhase("idle");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function toggleTorch() {
    const newState = !torch;
    // Use native Android torch bridge (most reliable on Android WebView)
    const androidTorch = (window as unknown as { AndroidTorch?: { setTorch: (on: boolean) => void } }).AndroidTorch;
    if (androidTorch) {
      androidTorch.setTorch(newState);
      setTorch(newState);
      return;
    }
    // Fallback: web API (works on some browsers)
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // @ts-expect-error torch is non-standard
      await track.applyConstraints({ advanced: [{ torch: newState }] });
      setTorch(newState);
    } catch {
      // silently ignore
    }
  }

  // After capture/upload we go to "crop" instead of straight to OCR.
  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.92);
    stopCamera();
    setRawDataUrl(dataUrl);
    setPhase("crop");
  }

  // Called by CropStep with a full-resolution cropped canvas + dataUrl.
  async function onCropConfirmed(croppedCanvas: HTMLCanvasElement, croppedDataUrl: string) {
    setPhase("processing");
    setProgress(0);
    setImageDataUrl(croppedDataUrl);
    try {
      const result = await runOcr(croppedCanvas, setProgress);

      // Apply business rules: alphanumeric → serial, digits-only → part (7 digits max)
      const classified = applyBusinessRules(result.serial, result.part);

      // Merge with values accumulated from previous partial scans
      const finalSerial = accSerial || classified.serial;
      const finalPart   = accPart   || classified.part;

      if (finalSerial && finalPart) {
        // ✓ Both found — proceed to review
        const merged: OcrResult = {
          ...result,
          serial: finalSerial,
          part: finalPart,
          originalSerial: finalSerial,
          originalPart: finalPart,
        };
        setOcr(merged);
        setSerial(finalSerial);
        setPart(finalPart);
        // Clear accumulated state (no longer needed)
        setAccSerial("");
        setAccPart("");
        setPhase("review");
      } else {
        // ✗ Missing at least one — save what we have and ask for rescan
        setAccSerial(finalSerial);
        setAccPart(finalPart);
        setOcr(result);
        setPhase("partial");
      }
    } catch (e) {
      console.error(e);
      alert("OCR failed. Try again with better lighting or a tighter crop.");
      setPhase("crop");
    }
  }

  function reset() {
    setOcr(null);
    setImageDataUrl(null);
    setRawDataUrl(null);
    setSerial("");
    setPart("");
    setAccSerial("");
    setAccPart("");
    setProgress(0);
    setPhase("idle");
  }

  function handlePrint() {
    // Use the native Android PrintManager bridge injected by MainActivity.
    // This opens the real Android print dialog (choose printer, save as PDF, etc.)
    const androidPrint = (window as unknown as { AndroidPrint?: { print: () => void } }).AndroidPrint;
    if (androidPrint) {
      androidPrint.print();
    } else {
      // Fallback for desktop / iOS
      window.print();
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24 space-y-6">
      {phase === "idle" && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-6 sm:p-8">
              <div className="text-[10px] uppercase tracking-[0.25em] text-primary mb-2">
                Step 1
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                Scan an embossed machine plate
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Point your camera at the metal plate, then crop tightly around just the embossed text.
                AI will read the top line as the serial number and the bottom line as the part number.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-3 font-semibold hover:opacity-90"
                >
                  <Camera className="h-5 w-5" /> Open camera
                </button>
              </div>
            </div>
            <div className="h-1 stripes" />
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <Tip n="01" title="Fill the frame">
              Hold steady and fill the frame with the engraved plate.
            </Tip>
            <Tip n="02" title="Side light">
              Angled light makes embossed digits cast readable shadows.
            </Tip>
            <Tip n="03" title="Crop tight">
              The tighter you crop around just the text, the faster and more accurate the scan.
            </Tip>
          </div>
        </section>
      )}

      {phase === "camera" && (
        <section className="space-y-4">
          <button
            onClick={() => { stopCamera(); setPhase("idle"); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="relative rounded-2xl overflow-hidden border border-border bg-black aspect-[3/4] sm:aspect-video">
            <video
              ref={videoRef}
              className="w-full h-full object-cover bg-black"
              playsInline
              muted
              poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            />
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-6 top-1/3 bottom-1/3 border-2 border-primary/80 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              <div className="absolute top-2 left-2 right-2 flex justify-between">
                <span className="text-[10px] uppercase tracking-[0.25em] text-primary bg-black/60 px-2 py-1 rounded">
                  Align plate inside frame
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={toggleTorch}
              className={`px-4 py-2 rounded-lg border border-border text-sm flex items-center gap-2 ${
                torch ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
              }`}
            >
              <Zap className="h-4 w-4" /> Flash
            </button>
            <button
              onClick={capture}
              className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold flex items-center gap-2 hover:opacity-90"
            >
              <ScanLine className="h-5 w-5" /> Capture
            </button>
          </div>
        </section>
      )}

      {phase === "crop" && rawDataUrl && (
        <section className="space-y-4">
          <button
            onClick={() => { setRawDataUrl(null); setPhase("idle"); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <CropStep
            sourceDataUrl={rawDataUrl}
            onCancel={() => { setRawDataUrl(null); setPhase("idle"); }}
            onConfirm={onCropConfirmed}
          />
        </section>
      )}

      {phase === "processing" && (
        <section className="space-y-4">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <div className="font-semibold">Reading embossed text…</div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {Math.round(progress * 100)}% — preprocessing & OCR
          </div>
          </div>
        </section>
      )}

      {phase === "partial" && (
        <section className="space-y-4">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Start over
          </button>

          {/* What was found so far */}
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-4">
            <div className="text-amber-400 font-bold text-sm uppercase tracking-widest">
              Incomplete — scan again
            </div>

            {accSerial ? (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-emerald-400">
                  ✓ Serial number found
                </div>
                <div className="font-mono text-lg font-bold tracking-widest text-foreground">
                  {accSerial}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-red-400">
                  ✗ Serial number not detected
                </div>
                <div className="text-xs text-muted-foreground">
                  Serial numbers are alphanumeric (letters + digits, e.g. <span className="font-mono">CAT1234A</span>)
                </div>
              </div>
            )}

            {accPart ? (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-emerald-400">
                  ✓ Part number found
                </div>
                <div className="font-mono text-lg font-bold tracking-widest text-foreground">
                  {accPart}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-red-400">
                  ✗ Part number not detected
                </div>
                <div className="text-xs text-muted-foreground">
                  Part numbers are digits only (e.g. <span className="font-mono">1234567</span> or <span className="font-mono">123-4567</span>)
                </div>
              </div>
            )}
          </div>

          {/* Rescan CTA */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              {!accSerial && !accPart
                ? "No numbers were detected. Point the camera directly at the embossed plate and ensure good lighting."
                : !accSerial
                ? "Scan the plate that shows the serial number (alphanumeric)."
                : "Scan the plate that shows the part number (digits only)."}
            </p>
            <button
              onClick={startCamera}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-3 font-semibold hover:opacity-90"
            >
              <Camera className="h-5 w-5" />
              {!accSerial && !accPart
                ? "Scan again"
                : !accSerial
                ? "Scan serial number"
                : "Scan part number"}
            </button>
          </div>
        </section>
      )}

      {phase === "review" && ocr && (
        <section className="space-y-4">
          {/* Back button */}
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Scan again
          </button>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-5 grid sm:grid-cols-[180px_1fr] gap-5">
              {imageDataUrl && (
                <img
                  src={imageDataUrl}
                  alt="Scanned plate"
                  className="w-full sm:w-[180px] h-32 sm:h-full object-cover rounded-lg border border-border"
                />
              )}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-primary">
                    Detected — review & correct
                  </div>
                  <ConfidenceBadge value={ocr.confidence} />
                </div>
                <Field
                  label="Serial number (top line)"
                  value={serial}
                  original={ocr.originalSerial}
                  onChange={setSerial}
                />
                <Field
                  label="Part number (bottom line)"
                  value={part}
                  original={ocr.originalPart}
                  onChange={setPart}
                />
              </div>
            </div>
            <div className="border-t border-border p-4 flex justify-end bg-background/40">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90"
              >
                <Printer className="h-5 w-5" /> Print
              </button>
            </div>
          </div>

          <div className="print-area rounded-2xl border border-border bg-card p-5 grid sm:grid-cols-2 gap-4">
            {(serial || part) && (
              <div className="sm:col-span-2">
                <Barcode
                  value={`${serial.replace(/\s+/g, "")}|${part.replace(/\s+/g, "")}`}
                  label={`Serial ${serial || "—"}  •  Part ${part || "—"}`}
                  height={100}
                />
              </div>
            )}
          </div>
        </section>
      )}

    </div>
  );
}

function Tip({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4 bg-card">
      <div className="text-[10px] tracking-[0.25em] text-primary mb-1">{n}</div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  original,
  onChange,
}: {
  label: string;
  value: string;
  original: string;
  onChange: (s: string) => void;
}) {
  const changed = value.trim() !== original.trim();
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        {changed && (
          <span className="text-[10px] uppercase tracking-wider text-primary">
            corrected
          </span>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="mono w-full bg-background border border-border rounded-lg px-3 py-3 text-lg font-bold tracking-widest focus:outline-none focus:border-primary overflow-x-auto"
        style={{ userSelect: "text", WebkitUserSelect: "text" }}
        placeholder="—"
      />
      {original && (
        <div className="text-[10px] text-muted-foreground mt-1 mono">
          OCR raw: {original || "—"}
        </div>
      )}
    </label>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const v = Math.round(value);
  const color =
    v >= 80
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : v >= 60
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-red-500/15 text-red-400 border-red-500/30";
  return (
    <span
      className={`text-[10px] uppercase tracking-widest border px-2 py-1 rounded-md ${color}`}
    >
      {v}% confidence
    </span>
  );
}