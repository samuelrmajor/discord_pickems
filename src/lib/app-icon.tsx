// Shared artwork for the favicon, the maskable PWA icon, and the iOS home
// screen icon: the FWL mark from `public/fwl_icon.png`, inlined as a data URI
// because `ImageResponse` renders on the server with no origin to fetch from.
//
// The source art is 80x80, so every icon here is an upscale. The mark is a
// blocky logo rather than fine linework, which survives that; keep any future
// artwork at 512 or larger and this stops mattering.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ICON_BACKGROUND = "#0b0f14";

// Read once per process, not once per request — these routes are static, but
// the file read still shouldn't sit in the render path.
const MARK_DATA_URI = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "fwl_icon.png"),
).toString("base64")}`;

/**
 * `inset` is the share of the canvas left as background around the mark.
 * Full-bleed (0) for the favicon and iOS, where the art's own rounded frame is
 * the icon; padded for Android's maskable crop, which eats the outer ~10% on
 * each side and would otherwise clip the frame.
 */
export function AppIcon({ size, inset = 0 }: { size: number; inset?: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BACKGROUND,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={MARK_DATA_URI}
        alt=""
        width={size * (1 - inset * 2)}
        height={size * (1 - inset * 2)}
      />
    </div>
  );
}
