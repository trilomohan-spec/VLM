import { useEffect, useRef, useState } from "react";
import { ScanLine, RefreshCw } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  sourceDataUrl: string;
  onCancel: () => void;
  onConfirm: (croppedCanvas: HTMLCanvasElement, croppedDataUrl: string) => void;
};

// Pixel margin for touch targets on the handles (in display pixels)
const HANDLE = 22;

/**
 * Manual crop step: shows the captured photo with a draggable/resizable
 * rectangle overlay. The user adjusts to fit just the embossed plate, then
 * confirms. This is the single biggest accuracy gain for embossed OCR —
 * removes 90%+ of the background that confuses tesseract.
 */
export default function CropStep({ sourceDataUrl, onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Crop rectangle expressed as fractions of the displayed image (0-1).
  // Storing as fractions means resizing the window doesn't move the box
  // relative to the photo.
  const [rect, setRect] = useState<Rect>({ x: 0.1, y: 0.35, w: 0.8, h: 0.3 });
  // Track image natural dims so we can produce a full-resolution crop.
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  // Display dims of the image after the browser has fitted it inside the wrapper.
  const [dispDims, setDispDims] = useState<{ w: number; h: number; ox: number; oy: number } | null>(null);

  // Active drag state — either moving the whole box or resizing from one corner/edge.
  type DragKind =
    | "move"
    | "n" | "s" | "e" | "w"
    | "ne" | "nw" | "se" | "sw"
    | null;
  const dragRef = useRef<{
    kind: DragKind;
    startX: number;
    startY: number;
    startRect: Rect;
  } | null>(null);

  // Re-measure display dims when the image loads or the window resizes.
  // The img uses object-contain so the actual image bounds may not fill
  // the wrapper. We need to map pointer coordinates to those real bounds.
  const measure = () => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap || !imgDims) return;
    const wrapRect = wrap.getBoundingClientRect();
    // object-contain inside the wrapper — compute the fitted box manually.
    const aspect = imgDims.w / imgDims.h;
    const wrapAspect = wrapRect.width / wrapRect.height;
    let dw: number, dh: number;
    if (aspect > wrapAspect) {
      dw = wrapRect.width;
      dh = wrapRect.width / aspect;
    } else {
      dh = wrapRect.height;
      dw = wrapRect.height * aspect;
    }
    setDispDims({
      w: dw,
      h: dh,
      ox: (wrapRect.width - dw) / 2,
      oy: (wrapRect.height - dh) / 2,
    });
  };

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgDims]);

  // --- Pointer handling -----------------------------------------------------

  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    // Pick a default rect that's biased toward the middle horizontal band —
    // most embossed plates are wider than tall and sit roughly mid-frame.
    setRect({ x: 0.08, y: 0.32, w: 0.84, h: 0.36 });
  };

  // Convert a pointer event to fraction-space coords inside the displayed image.
  // Clamps so the rect can't escape the image bounds.
  const toFrac = (e: React.PointerEvent | PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap || !dispDims) return { fx: 0, fy: 0 };
    const wr = wrap.getBoundingClientRect();
    const px = e.clientX - wr.left - dispDims.ox;
    const py = e.clientY - wr.top - dispDims.oy;
    return {
      fx: Math.max(0, Math.min(1, px / dispDims.w)),
      fy: Math.max(0, Math.min(1, py / dispDims.h)),
    };
  };

  const startDrag = (kind: DragKind, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...rect },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !dispDims) return;
    const d = dragRef.current;
    // Convert px delta to fraction-of-image delta
    const dfx = (e.clientX - d.startX) / dispDims.w;
    const dfy = (e.clientY - d.startY) / dispDims.h;
    let { x, y, w, h } = d.startRect;
    const minW = 0.05;
    const minH = 0.05;

    switch (d.kind) {
      case "move":
        x = Math.max(0, Math.min(1 - w, x + dfx));
        y = Math.max(0, Math.min(1 - h, y + dfy));
        break;
      case "e":
        w = Math.max(minW, Math.min(1 - x, w + dfx));
        break;
      case "w": {
        const newX = Math.max(0, Math.min(x + w - minW, x + dfx));
        w = w + (x - newX);
        x = newX;
        break;
      }
      case "s":
        h = Math.max(minH, Math.min(1 - y, h + dfy));
        break;
      case "n": {
        const newY = Math.max(0, Math.min(y + h - minH, y + dfy));
        h = h + (y - newY);
        y = newY;
        break;
      }
      case "ne":
        w = Math.max(minW, Math.min(1 - x, w + dfx));
        { const newY = Math.max(0, Math.min(y + h - minH, y + dfy));
          h = h + (y - newY); y = newY; }
        break;
      case "nw": {
        const newX = Math.max(0, Math.min(x + w - minW, x + dfx));
        const newY = Math.max(0, Math.min(y + h - minH, y + dfy));
        w = w + (x - newX); x = newX;
        h = h + (y - newY); y = newY;
        break;
      }
      case "se":
        w = Math.max(minW, Math.min(1 - x, w + dfx));
        h = Math.max(minH, Math.min(1 - y, h + dfy));
        break;
      case "sw": {
        const newX = Math.max(0, Math.min(x + w - minW, x + dfx));
        w = w + (x - newX); x = newX;
        h = Math.max(minH, Math.min(1 - y, h + dfy));
        break;
      }
    }
    setRect({ x, y, w, h });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // --- Confirm: produce a full-res crop canvas -----------------------------

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !imgDims) return;
    // Crop in natural coordinates so we keep maximum resolution.
    const sx = Math.round(rect.x * imgDims.w);
    const sy = Math.round(rect.y * imgDims.h);
    const sw = Math.round(rect.w * imgDims.w);
    const sh = Math.round(rect.h * imgDims.h);
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = c.toDataURL("image/jpeg", 0.92);
    onConfirm(c, dataUrl);
  };

  // --- Render ---------------------------------------------------------------

  // Convert frac-rect to display pixels for the overlay
  const overlayStyle = dispDims
    ? {
        left: dispDims.ox + rect.x * dispDims.w,
        top: dispDims.oy + rect.y * dispDims.h,
        width: rect.w * dispDims.w,
        height: rect.h * dispDims.h,
      }
    : { left: 0, top: 0, width: 0, height: 0 };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary mb-1">
          Step 2 — Crop to the plate
        </div>
        <p className="text-sm text-muted-foreground">
          Drag the rectangle to surround just the embossed text. Tighter crops scan faster
          and more accurately.
        </p>
      </div>

      <div
        ref={wrapRef}
        className="relative bg-black rounded-xl overflow-hidden select-none touch-none"
        style={{ aspectRatio: "4 / 3" }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          ref={imgRef}
          src={sourceDataUrl}
          onLoad={onImgLoad}
          alt="Captured plate"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />

        {dispDims && (
          <>
            {/* Dimming everything outside the crop box. Four divs because a
                single semi-transparent overlay with a hole requires SVG/mask. */}
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: 0, top: 0, right: 0,
                height: overlayStyle.top,
              }}
            />
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: 0,
                top: overlayStyle.top,
                width: overlayStyle.left,
                height: overlayStyle.height,
              }}
            />
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: (overlayStyle.left as number) + (overlayStyle.width as number),
                top: overlayStyle.top,
                right: 0,
                height: overlayStyle.height,
              }}
            />
            <div
              className="absolute bg-black/60 pointer-events-none"
              style={{
                left: 0,
                top: (overlayStyle.top as number) + (overlayStyle.height as number),
                right: 0, bottom: 0,
              }}
            />

            {/* The crop rectangle itself */}
            <div
              className="absolute border-2 border-primary cursor-move"
              style={overlayStyle}
              onPointerDown={(e) => startDrag("move", e)}
            >
              {/* Resize handles — large hit areas for fingers */}
              <Handle pos="nw" onDown={(e) => startDrag("nw", e)} />
              <Handle pos="ne" onDown={(e) => startDrag("ne", e)} />
              <Handle pos="sw" onDown={(e) => startDrag("sw", e)} />
              <Handle pos="se" onDown={(e) => startDrag("se", e)} />
              <Handle pos="n" onDown={(e) => startDrag("n", e)} />
              <Handle pos="s" onDown={(e) => startDrag("s", e)} />
              <Handle pos="e" onDown={(e) => startDrag("e", e)} />
              <Handle pos="w" onDown={(e) => startDrag("w", e)} />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Re-capture
        </button>
        <button
          onClick={confirm}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold hover:opacity-90"
        >
          <ScanLine className="h-5 w-5" /> Scan crop
        </button>
      </div>
    </section>
  );
}

function Handle({
  pos,
  onDown,
}: {
  pos: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
  onDown: (e: React.PointerEvent) => void;
}) {
  const map: Record<string, string> = {
    nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
    ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
    sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
    se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
    n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
    s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
    e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
    w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  };
  return (
    <div
      onPointerDown={onDown}
      className={`absolute ${map[pos]} bg-primary border-2 border-white rounded-full`}
      style={{ width: HANDLE, height: HANDLE, touchAction: "none" }}
    />
  );
}
