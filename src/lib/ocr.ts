import Tesseract from "tesseract.js";

export type OcrResult = {
  serial: string;
  part: string;
  originalSerial: string;
  originalPart: string;
  confidence: number;
  rawText: string;
};

// ── API key — must match the value in ocr_server.py ──────────────────────
const API_KEY = "EZI-TRILO-OCR-2025";

// ── Runtime server URL stored in localStorage ──────────────────────────────
const SERVER_KEY = "ezi_server_url";

export function getServerUrl(): string {
  return (localStorage.getItem(SERVER_KEY) ?? "").replace(/\/$/, "");
}

export function setServerUrl(url: string) {
  const clean = url.trim().replace(/\/$/, "");
  localStorage.setItem(SERVER_KEY, clean);
}

/** Ping the server — returns true if reachable */
export async function testServerConnection(url?: string): Promise<boolean> {
  const base = (url ?? getServerUrl()).replace(/\/$/, "");
  if (!base) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(`${base}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return r.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function canvasFrom(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) return source;
  const c = document.createElement("canvas");
  c.width = source.naturalWidth || source.width;
  c.height = source.naturalHeight || source.height;
  c.getContext("2d")!.drawImage(source, 0, 0);
  return c;
}

/** Grayscale + contrast stretch for embossed metal plates */
function preprocess(src: HTMLCanvasElement): HTMLCanvasElement {
  const maxW = 1600;
  const scale = src.width > maxW ? maxW / src.width : 1;
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let min = 255, max = 0;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = ((gray[j] - min) * 255 / range) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ── Business rules ─────────────────────────────────────────────────────────

/**
 * Classify a single OCR token:
 *  - Has both letters AND digits → serial number
 *  - Has only digits and "-"    → part number, truncated to first 7 digit positions
 *  - Otherwise                  → null (unclassifiable)
 */
export function classifyOcrString(
  s: string,
): { type: "serial" | "part"; value: string } | null {
  const clean = s.trim().toUpperCase();
  if (!clean) return null;

  const hasLetters = /[A-Z]/.test(clean);
  const hasDigits = /[0-9]/.test(clean);

  // Strip spaces before digit-only test — part numbers often have spaces between
  // digit groups on the embossed plate (e.g. "326 4678 05")
  const noSpaces = clean.replace(/\s+/g, "");
  const digitsAndDashOnly = /^[0-9-]+$/.test(noSpaces);

  if (hasLetters && hasDigits) {
    return { type: "serial", value: clean };
  }

  if (digitsAndDashOnly && hasDigits) {
    // Keep first 7 digit positions from space-stripped string, preserving any "-"
    let digitCount = 0;
    let result = "";
    for (const ch of noSpaces) {
      if (ch >= "0" && ch <= "9") {
        digitCount++;
        if (digitCount > 7) break;
        result += ch;
      } else if (ch === "-" && digitCount > 0 && digitCount < 7) {
        result += ch;
      }
    }
    return result ? { type: "part", value: result } : null;
  }

  return null;
}

/**
 * Apply business rules to reclassify whatever the OCR returned.
 * Processes both the raw serial and part strings from OCR and returns
 * the correctly classified values (either may be "" if not detected).
 */
export function applyBusinessRules(
  rawSerial: string,
  rawPart: string,
): { serial: string; part: string } {
  let serial = "";
  let part = "";

  for (const candidate of [rawSerial, rawPart].filter(Boolean)) {
    const r = classifyOcrString(candidate);
    if (!r) continue;
    if (r.type === "serial" && !serial) serial = r.value;
    if (r.type === "part" && !part) part = r.value;
  }

  return { serial, part };
}

// ─────────────────────────────────────────────────────────────────────────────

/** Parse raw text into serial/part lines (Tesseract fallback only) */
function parseLines(raw: string): { serial: string; part: string } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/[^A-Z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toUpperCase())
    .filter((l) => l.replace(/\s/g, "").length >= 2);
  return { serial: lines[0] ?? "", part: lines[1] ?? "" };
}

/**
 * Send the cropped image to the backend model server.
 * Expected response shape:
 *   { serial: string, part: string, confidence: number }
 * The server may also return the legacy { text, confidence } shape.
 */
async function ocrWithServer(
  canvas: HTMLCanvasElement,
  onProgress?: (p: number) => void,
): Promise<{ serial: string; part: string; confidence: number }> {
  const serverUrl = getServerUrl();
  if (!serverUrl) throw new Error("No server URL configured");

  const blob: Blob = await new Promise((res) =>
    canvas.toBlob((b) => res(b!), "image/jpeg", 0.92),
  );
  const fd = new FormData();
  fd.append("image", blob, "plate.jpg");

  onProgress?.(0.3);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000); // 90s — model inference can be slow
  const r = await fetch(`${serverUrl}/ocr`, {
    method: "POST",
    body: fd,
    headers: { "X-API-Key": API_KEY },
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!r.ok) throw new Error(`Server responded ${r.status}`);
  onProgress?.(0.9);

  const j = await r.json();

  // Preferred shape: { serial, part, confidence }
  if (typeof j.serial === "string" && typeof j.part === "string") {
    return {
      serial: String(j.serial).toUpperCase().trim(),
      part: String(j.part).toUpperCase().trim(),
      confidence: typeof j.confidence === "number" ? j.confidence : 80,
    };
  }

  // Legacy fallback: { text, confidence }
  const text: string = j.text ?? (Array.isArray(j.lines) ? j.lines.join("\n") : "");
  const { serial, part } = parseLines(text);
  return { serial, part, confidence: j.confidence ?? 80 };
}

async function ocrWithTesseract(
  canvas: HTMLCanvasElement,
  onProgress?: (p: number) => void,
): Promise<{ serial: string; part: string; confidence: number }> {
  const { data } = await Tesseract.recognize(canvas, "eng", {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.(0.3 + m.progress * 0.7);
      }
    },
  } as never);
  const { serial, part } = parseLines(data.text || "");
  return { serial, part, confidence: data.confidence ?? 0 };
}

export async function runOcr(
  source: HTMLCanvasElement | HTMLImageElement,
  onProgress?: (p: number) => void,
): Promise<OcrResult> {
  onProgress?.(0.05);
  const base = canvasFrom(source);
  const prepped = preprocess(base);
  onProgress?.(0.15);

  const serverUrl = getServerUrl();

  let serial = "", part = "", confidence = 0;

  try {
    if (serverUrl) {
      // Use backend model
      const r = await ocrWithServer(prepped, onProgress);
      serial = r.serial;
      part = r.part;
      confidence = r.confidence;
      onProgress?.(1);
    } else {
      // Fallback: on-device Tesseract.js
      const r = await ocrWithTesseract(prepped, onProgress);
      serial = r.serial;
      part = r.part;
      confidence = r.confidence;
    }
  } catch (e) {
    console.error("OCR failed", e);
    throw e;
  }

  return {
    serial,
    part,
    originalSerial: serial,
    originalPart: part,
    confidence: Math.round(confidence),
    rawText: "",
  };
}