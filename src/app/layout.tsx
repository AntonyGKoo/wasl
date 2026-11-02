import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Wasl — memory for your network",
  description: "Remember who you met, why it mattered, and who can help next.",
  applicationName: "Wasl",
  // opened from the home screen, it runs full screen with its own name
  appleWebApp: { capable: true, title: "Wasl", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#087f83",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
