import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/app-icon";

// The maskable variant. Android crops this to whatever shape the launcher
// uses, so the mark is inset to keep its frame out of the bite.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<AppIcon size={size.width} inset={0.1} />, { ...size });
}
