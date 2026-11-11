"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

// An app added to the home screen isn't reloaded when you switch back to it: the phone resumes the
// page it already had, sometimes from days ago. So each time Wasl comes back to the screen (and every
// 15 minutes while it's open) it asks which build is live. If that's newer, it reloads by itself when
// you've been away a while and nothing is open; otherwise it offers a Reload button, so nothing you're
// typing is lost.
const BUILD = process.env.WASL_BUILD || "dev";
const AWAY = 30 * 60 * 1000;
const EVERY = 15 * 60 * 1000;

export function UpdateWatcher() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (BUILD === "dev") return;
    let hiddenAt = 0;
    let checkedAt = 0;
    let stopped = false;
    async function check(cameBack: boolean) {
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      if (!cameBack && Date.now() - checkedAt < EVERY) return;
      checkedAt = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (stopped || !build || build === "dev" || build === BUILD) return;
        const busy =
          document.querySelector("[role=dialog]") ||
          [...document.querySelectorAll("textarea")].some((t) =>
            t.value.trim(),
          );
        if (cameBack && away > AWAY && !busy) window.location.reload();
        else setReady(true);
      } catch {
        // offline: try again next time
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else void check(true).finally(() => (hiddenAt = 0));
    };
    const onShow = (e: PageTransitionEvent) => e.persisted && void check(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check(false);
    }, EVERY);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onShow);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
  if (!ready) return null;
  return (
    <div className="update-ready" role="status">
      <span>A new version of Wasl is ready.</span>
      <button onClick={() => window.location.reload()}>
        <RefreshCw size={15} /> Reload
      </button>
    </div>
  );
}
