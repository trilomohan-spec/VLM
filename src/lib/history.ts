import { useEffect, useState } from "react";

export type ScanRecord = {
  id: string;
  createdAt: number;
  serial: string;
  part: string;
  originalSerial: string;
  originalPart: string;
  confidence: number;
  imageDataUrl?: string;
  operator?: string;
  corrected: boolean;
};

const KEY = "msbg.history.v1";
const CORR_KEY = "msbg.corrections.v1";
const PATTERN_KEY = "msbg.patterns.v1";

export function loadHistory(): ScanRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveScan(rec: ScanRecord) {
  const all = loadHistory();
  all.unshift(rec);
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 500)));
  if (rec.corrected) {
    addCorrection(rec.originalSerial, rec.serial);
    addCorrection(rec.originalPart, rec.part);
    // re-learn patterns from all corrected scans whenever a new correction lands
    relearnPatterns();
  }
}

export function deleteScan(id: string) {
  const all = loadHistory().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearHistory() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(CORR_KEY);
  localStorage.removeItem(PATTERN_KEY);
}

// ---------- corrections store ----------

type CorrectionMap = Record<string, string>;

export function loadCorrections(): CorrectionMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CORR_KEY) || "{}");
  } catch {
    return {};
  }
}

function addCorrection(original: string, corrected: string) {
  if (!original || !corrected || original === corrected) return;
  const map = loadCorrections();
  map[original.trim().toUpperCase()] = corrected.trim().toUpperCase();
  localStorage.setItem(CORR_KEY, JSON.stringify(map));
}

// ---------- learned patterns ----------

type FieldPattern = {
  // length -> count
  lengths: Record<number, number>;
  // position -> { L: letters, D: digits }
  positions: Array<{ L: number; D: number }>;
  // known good values (the corrected serials/parts we've seen)
  known: string[];
  totalSamples: number;
};

type LearnedPatterns = {
  serial: FieldPattern;
  part: FieldPattern;
  // per-position confusions: position -> { fromChar -> { toChar -> count } }
  serialConfusions: Record<string, Record<string, Record<string, number>>>;
  partConfusions: Record<string, Record<string, Record<string, number>>>;
};

function emptyPattern(): FieldPattern {
  return { lengths: {}, positions: [], known: [], totalSamples: 0 };
}

function emptyPatterns(): LearnedPatterns {
  return {
    serial: emptyPattern(),
    part: emptyPattern(),
    serialConfusions: {},
    partConfusions: {},
  };
}

export function loadPatterns(): LearnedPatterns {
  if (typeof window === "undefined") return emptyPatterns();
  try {
    const raw = localStorage.getItem(PATTERN_KEY);
    if (!raw) return emptyPatterns();
    return { ...emptyPatterns(), ...JSON.parse(raw) };
  } catch {
    return emptyPatterns();
  }
}

function savePatterns(p: LearnedPatterns) {
  localStorage.setItem(PATTERN_KEY, JSON.stringify(p));
}

function classifyChar(c: string): "L" | "D" | null {
  if (/[A-Z]/.test(c)) return "L";
  if (/[0-9]/.test(c)) return "D";
  return null;
}

function ingestSample(pat: FieldPattern, value: string) {
  const v = value.replace(/\s/g, "").toUpperCase();
  if (!v) return;
  pat.totalSamples++;
  pat.lengths[v.length] = (pat.lengths[v.length] || 0) + 1;
  while (pat.positions.length < v.length) pat.positions.push({ L: 0, D: 0 });
  for (let i = 0; i < v.length; i++) {
    const k = classifyChar(v[i]);
    if (k) pat.positions[i][k]++;
  }
  if (!pat.known.includes(v)) pat.known.push(v);
  if (pat.known.length > 1000) pat.known = pat.known.slice(-1000);
}

function ingestConfusion(
  store: Record<string, Record<string, Record<string, number>>>,
  original: string,
  corrected: string,
) {
  const a = original.replace(/\s/g, "").toUpperCase();
  const b = corrected.replace(/\s/g, "").toUpperCase();
  if (!a || !b || a.length !== b.length) return; // only same-length pairs give clean per-position data
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (!/[A-Z0-9]/.test(a[i]) || !/[A-Z0-9]/.test(b[i])) continue;
    const pos = String(i);
    store[pos] = store[pos] || {};
    store[pos][a[i]] = store[pos][a[i]] || {};
    store[pos][a[i]][b[i]] = (store[pos][a[i]][b[i]] || 0) + 1;
  }
}

/**
 * Rebuild patterns from the full history. Cheap — history is capped at 500.
 */
export function relearnPatterns() {
  const hist = loadHistory();
  const p = emptyPatterns();
  for (const rec of hist) {
    // the (possibly user-corrected) final value is our ground truth
    ingestSample(p.serial, rec.serial);
    ingestSample(p.part, rec.part);
    if (rec.corrected) {
      ingestConfusion(p.serialConfusions, rec.originalSerial, rec.serial);
      ingestConfusion(p.partConfusions, rec.originalPart, rec.part);
    }
  }
  savePatterns(p);
}

// ---------- applying what we learned ----------

function dominantClassAt(pat: FieldPattern, i: number): "L" | "D" | null {
  if (i >= pat.positions.length) return null;
  const { L, D } = pat.positions[i];
  const total = L + D;
  if (total < 3) return null; // need a few samples to trust the position
  if (L / total >= 0.85) return "L";
  if (D / total >= 0.85) return "D";
  return null;
}

// Universal Tesseract failure modes for embossed digits/letters.
// Used only as a fallback when we have no per-position data yet.
const FALLBACK_TO_DIGIT: Record<string, string> = {
  O: "0", Q: "0", D: "0",
  I: "1", L: "1", T: "1", J: "1",
  Z: "2",
  E: "3",
  A: "4",
  S: "5",
  G: "6", C: "6",
  B: "8",
};
const FALLBACK_TO_LETTER: Record<string, string> = {
  "0": "O",
  "1": "I",
  "2": "Z",
  "3": "E",
  "4": "A",
  "5": "S",
  "6": "G",
  "8": "B",
};

function bestConfusionFix(
  store: Record<string, Record<string, Record<string, number>>>,
  pos: number,
  ch: string,
): string | null {
  const at = store[String(pos)];
  if (!at) return null;
  const opts = at[ch];
  if (!opts) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [to, count] of Object.entries(opts)) {
    if (count > bestCount) {
      best = to;
      bestCount = count;
    }
  }
  // require at least 2 observations before trusting the swap
  return bestCount >= 2 ? best : null;
}

function applyPositionRules(
  value: string,
  pat: FieldPattern,
  confusions: Record<string, Record<string, Record<string, number>>>,
): string {
  const v = value.replace(/\s/g, "").toUpperCase();
  if (!v) return v;

  // if length is wildly off, don't guess
  const expectedLen = mostCommonLength(pat);
  if (expectedLen && Math.abs(v.length - expectedLen) > 1) return v;

  const out = v.split("");
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];

    // 1) learned per-position fix (highest priority)
    const learned = bestConfusionFix(confusions, i, ch);
    if (learned) {
      out[i] = learned;
      continue;
    }

    // 2) class enforcement using universal OCR fallbacks
    const want = dominantClassAt(pat, i);
    const have = classifyChar(ch);
    if (!want || !have || want === have) continue;
    if (want === "D" && FALLBACK_TO_DIGIT[ch]) out[i] = FALLBACK_TO_DIGIT[ch];
    else if (want === "L" && FALLBACK_TO_LETTER[ch]) out[i] = FALLBACK_TO_LETTER[ch];
  }
  return out.join("");
}

function mostCommonLength(pat: FieldPattern): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [lenStr, count] of Object.entries(pat.lengths)) {
    if (count > bestCount) {
      best = Number(lenStr);
      bestCount = count;
    }
  }
  return bestCount >= 3 ? best : null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function snapToKnown(value: string, known: string[]): string {
  if (!value || known.length === 0) return value;
  if (known.includes(value)) return value;
  // short fields: 1 edit max; longer: 2 edits max
  const maxEdits = value.length <= 6 ? 1 : 2;
  let best = value;
  let bestDist = Infinity;
  for (const k of known) {
    if (Math.abs(k.length - value.length) > maxEdits) continue;
    const d = levenshtein(value, k);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return bestDist <= maxEdits ? best : value;
}

/**
 * Apply learned corrections, in order:
 *   1) exact-match lookup from the correction map
 *   2) per-position confusion fixes from same-length correction pairs
 *   3) per-position class enforcement (e.g. "position 4 must be a digit")
 *      using universal OCR-confusion fallbacks
 *   4) fuzzy-snap to a known-good value within a small edit distance
 *
 * Pass `field` so serial-rules don't bleed into part-numbers and vice versa.
 */
export function applyLearnedCorrections(
  text: string,
  field: "serial" | "part" = "serial",
): string {
  if (!text) return text;
  const raw = text.trim().toUpperCase();
  const map = loadCorrections();
  if (map[raw]) return map[raw];

  const patterns = loadPatterns();
  const pat = field === "serial" ? patterns.serial : patterns.part;
  const confusions =
    field === "serial" ? patterns.serialConfusions : patterns.partConfusions;

  if (pat.totalSamples < 3) return raw; // not enough data yet

  const ruled = applyPositionRules(raw, pat, confusions);
  const snapped = snapToKnown(ruled, pat.known);
  return snapped;
}

// ---------- hook & csv (unchanged behavior) ----------

export function useHistory() {
  const [items, setItems] = useState<ScanRecord[]>([]);
  useEffect(() => {
    setItems(loadHistory());
    const onStorage = () => setItems(loadHistory());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { items, reload: () => setItems(loadHistory()) };
}

export function exportCsv(items: ScanRecord[]): string {
  const header = "id,createdAt,serial,part,originalSerial,originalPart,confidence,corrected";
  const rows = items.map((s) =>
    [
      s.id,
      new Date(s.createdAt).toISOString(),
      s.serial,
      s.part,
      s.originalSerial,
      s.originalPart,
      s.confidence.toFixed(2),
      s.corrected,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

// ---------- training-data export ----------

// PaddleOCR finetuning expects a folder of images and a label file with
// one line per image:  filename.jpg<TAB>text-content
// We package both into a single .zip the user can extract on a Linux box
// when they're ready to finetune.
//
// JSZip is dynamically imported so the ~100KB bundle only loads when someone
// actually clicks the export button — keeps the scan flow lean.
export async function exportTrainingData(items: ScanRecord[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const imagesDir = zip.folder("images")!;

  // Two label files for flexibility:
  //   labels_serial.txt — for training a recognizer on serial-line crops
  //   labels_part.txt   — same for part-line crops
  //   labels_combined.txt — both lines as a single field (current app behavior)
  const serialLabels: string[] = [];
  const partLabels: string[] = [];
  const combinedLabels: string[] = [];

  let idx = 0;
  for (const s of items) {
    if (!s.imageDataUrl) continue;
    // data URLs come in as `data:image/jpeg;base64,XXXX` — strip the header
    // and store the bytes. We keep one image file per scan; for now we don't
    // try to crop into separate per-line images (PaddleOCR's detector handles
    // line splitting at inference time, so a finetuning script can either use
    // the detector's boxes or run on the whole image).
    const m = s.imageDataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) continue;
    const ext = m[1] === "image/png" ? "png" : "jpg";
    const filename = `${String(idx).padStart(5, "0")}_${s.id.slice(0, 8)}.${ext}`;
    imagesDir.file(filename, m[2], { base64: true });

    const ser = (s.serial || "").trim();
    const par = (s.part || "").trim();
    if (ser) serialLabels.push(`images/${filename}\t${ser}`);
    if (par) partLabels.push(`images/${filename}\t${par}`);
    combinedLabels.push(`images/${filename}\t${ser}\t${par}`);
    idx++;
  }

  zip.file("labels_serial.txt", serialLabels.join("\n") + "\n");
  zip.file("labels_part.txt", partLabels.join("\n") + "\n");
  zip.file("labels_combined.txt", combinedLabels.join("\n") + "\n");
  zip.file(
    "README.md",
    [
      "# Embossed Plate Training Data",
      "",
      `Exported ${new Date().toISOString()} — ${idx} labeled images.`,
      "",
      "## Files",
      "",
      "- `images/` — every scan that was saved with both an image and a label.",
      "- `labels_serial.txt` — `<image-path>\\t<serial>` per line.",
      "- `labels_part.txt` — `<image-path>\\t<part>` per line.",
      "- `labels_combined.txt` — `<image-path>\\t<serial>\\t<part>` per line.",
      "",
      "## Using for PaddleOCR finetuning",
      "",
      "When you have ~500+ labeled images, you can finetune PaddleOCR's recognizer:",
      "",
      "1. Clone PaddleOCR: `git clone https://github.com/PaddlePaddle/PaddleOCR`",
      "2. Convert labels to PaddleOCR's format (the format above is already compatible)",
      "3. Run the finetuning command from PaddleOCR's docs against a pretrained `en_PP-OCRv4_rec` model",
      "4. The output `.pdparams` file replaces the default recognizer in `ocr_server.py`",
      "",
      "Below ~500 images, finetuning typically *hurts* accuracy by overfitting.",
      "Keep collecting and re-export whenever you want a fresh batch.",
      "",
    ].join("\n"),
  );

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
