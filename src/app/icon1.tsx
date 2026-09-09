import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/app-icon";

// The large icon the manifest points at for install prompts and Android.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<AppIcon size={size.width} />, { ...size });
}
