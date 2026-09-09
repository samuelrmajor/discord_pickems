// Shared artwork for the favicon, the maskable PWA icon, and the iOS home
// screen icon. Full-bleed background so it survives Android's maskable crop
// and iOS's rounded-rect mask; the glyph sits inside the central safe zone.
export const ICON_BACKGROUND = "#0b0f14";
export const ICON_ACCENT = "#3ddc84";

export function AppIcon({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_BACKGROUND,
        color: ICON_ACCENT,
        fontSize: size * 0.62,
        fontWeight: 700,
        letterSpacing: -size * 0.03,
      }}
    >
      P
    </div>
  );
}
