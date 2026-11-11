"use client";
import { useEffect, useState } from "react";
import { Moon, Smartphone, Sun } from "lucide-react";

// Dark by default; the person can pick Light or "Match my phone", remembered on this device.
// The page is themed before it first paints by the script in app/layout.tsx.
import { THEME_KEY as KEY } from "@/lib/theme-script";
export type ThemeChoice = "system" | "light" | "dark";
const systemDark = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

function readChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}
function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  // the browser bar and phone status area match the page
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", dark ? "#111418" : "#f6f8fa"));
  return dark;
}
function save(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {}
  apply(choice);
  window.dispatchEvent(new Event("wasl-theme"));
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const sync = () => {
      const c = readChoice();
      setChoice(c);
      setDark(apply(c));
    };
    sync();
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", sync);
    window.addEventListener("wasl-theme", sync);
    window.addEventListener("storage", sync);
    return () => {
      media?.removeEventListener("change", sync);
      window.removeEventListener("wasl-theme", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { choice, dark, choose: save };
}

// keeps the theme in step with the phone's setting on pages without a switch
export function ThemeWatcher() {
  useTheme();
  return null;
}

// one tap between light and dark (top bar)
export function ThemeToggle() {
  const { dark, choose } = useTheme();
  return (
    <button
      className="icon-button theme-toggle"
      onClick={() => choose(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

// the full choice (Settings)
export function ThemeSetting() {
  const { choice, choose } = useTheme();
  const options: [ThemeChoice, string, typeof Sun][] = [
    ["dark", "Dark", Moon],
    ["light", "Light", Sun],
    ["system", "Match my phone", Smartphone],
  ];
  return (
    <div className="theme-setting" role="radiogroup" aria-label="Appearance">
      {options.map(([value, label, Icon]) => (
        <button
          key={value}
          role="radio"
          aria-checked={choice === value}
          className={choice === value ? "active" : ""}
          onClick={() => choose(value)}
        >
          <Icon size={16} /> {label}
        </button>
      ))}
    </div>
  );
}
