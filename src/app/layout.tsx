import type { Metadata, Viewport } from "next";
import "./globals.css";
// dark colors: each rule weighs the same as its light twin and loads after it
import "./theme-dark.css";
import "./theme-dark-tuning.css";
import { NoZoom } from "@/components/no-zoom";
import { ThemeWatcher } from "@/components/theme";
import { themeScript } from "@/lib/theme-script";
export const metadata: Metadata = {
  title: "Wasl — memory for your network",
  description: "Remember who you met, why it mattered, and who can help next.",
  applicationName: "Wasl",
  // opened from the home screen, it runs full screen with its own name
  appleWebApp: { capable: true, title: "Wasl", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // the browser bar matches the page in light and dark
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#111418" },
  ],
  width: "device-width",
  initialScale: 1,
  // an installed app keeps one size: no pinch or double-tap zoom
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NoZoom />
        <ThemeWatcher />
        {children}
      </body>
    </html>
  );
}
