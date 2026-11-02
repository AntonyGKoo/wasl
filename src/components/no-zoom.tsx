"use client";
import { useEffect } from "react";

// Safari ignores "user-scalable=no" in the browser, so stop its pinch gesture directly.
export function NoZoom() {
  useEffect(() => {
    const stop = (event: Event) => event.preventDefault();
    for (const name of ["gesturestart", "gesturechange", "gestureend"])
      document.addEventListener(name, stop, { passive: false });
    return () => {
      for (const name of ["gesturestart", "gesturechange", "gestureend"])
        document.removeEventListener(name, stop);
    };
  }, []);
  return null;
}
