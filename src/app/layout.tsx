import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_NAME = "FWL Fantasy";
const DESCRIPTION = "Weekly NFL pick'em, the group consensus parlay, and the Coach's Poll";

export const metadata: Metadata = {
  // Needed for the absolute URLs Discord and friends want in og: tags.
  metadataBase: new URL(process.env.APP_URL ?? "https://discordpickems.vercel.app"),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
  },
  // `title` here is the label iOS writes under the home screen icon.
  appleWebApp: {
    capable: true,
    title: "FWL Fantasy",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
