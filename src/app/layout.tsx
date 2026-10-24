import type { Metadata } from "next";
export const metadata: Metadata = { title: "Wasl — memory for your network", description: "Remember who you met, why it mattered, and who can help next." };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
