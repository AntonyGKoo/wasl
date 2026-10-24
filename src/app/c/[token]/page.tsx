import { PublicShare } from "@/components/public-share";
export const metadata = {
  title: "A connection worth keeping — Wasl",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicShare token={token} />;
}
