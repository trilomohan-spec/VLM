import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function Barcode({
  value,
  label,
  height = 80,
}: {
  value: string;
  label?: string;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width: 2,
        displayValue: true,
        font: "monospace",
        fontSize: 14,
        margin: 8,
        background: "#ffffff",
        lineColor: "#000000",
      });
      // Make the SVG scale to fill its container width instead of using a fixed pixel width
      ref.current.removeAttribute("width");
      ref.current.setAttribute("width", "100%");
      ref.current.style.display = "block";
    } catch {
      // ignore invalid value
    }
  }, [value, height]);

  return (
    <div className="bg-white text-black rounded-md p-3 w-full">
      {label && (
        <div
          className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1 text-center"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      )}
      {/* w-full ensures the SVG stretches to fill the card, never overflows */}
      <svg ref={ref} style={{ width: "100%", height: "auto" }} />
    </div>
  );
}