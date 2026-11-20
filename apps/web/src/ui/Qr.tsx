import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** A crisp SVG QR code. Encodes `value` with medium error correction. */
export function Qr({ value, size = 200, className = "" }: { value: string; size?: number; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#121316", light: "#FFFFFF" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <span
      role="img"
      aria-label="QR code"
      className={`block [&>svg]:h-full [&>svg]:w-full ${className}`}
      style={{ width: size, height: size }}
      // Generated locally by the qrcode library from our own string.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** PNG data URL of a QR code with a caption, for "Save QR to Photos". */
export async function qrPng(value: string, caption: string): Promise<string> {
  const qr = await QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 2, width: 720, color: { dark: "#121316", light: "#FFFFFF" } });
  const img = new Image();
  img.src = qr;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 800;
  c.height = 920;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 40, 40, 720, 720);
  ctx.fillStyle = "#121316";
  ctx.font = "600 34px Outfit, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(caption, 400, 830, 720);
  ctx.fillStyle = "#6C717C";
  ctx.font = "500 24px Outfit, system-ui, sans-serif";
  ctx.fillText("Scan with any UPI app · Let's Split", 400, 875, 720);
  return c.toDataURL("image/png");
}
