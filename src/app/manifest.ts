import type { MetadataRoute } from "next";
import { ICON_BACKGROUND } from "@/lib/app-icon";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FWL Fantasy",
    short_name: "FWL Fantasy",
    description: "Weekly NFL pick'em, the group consensus parlay, and the Coach's Poll",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: ICON_BACKGROUND,
    theme_color: ICON_BACKGROUND,
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/icon1", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
