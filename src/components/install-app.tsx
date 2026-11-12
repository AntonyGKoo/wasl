"use client";
import { useEffect, useState } from "react";
import {
  Check,
  Download,
  Share,
  Smartphone,
  SquarePlus,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { Button } from "./ui";

// Chrome, Edge and Samsung Internet offer this event; Safari doesn't, so iPhones get steps instead.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Device = "ios" | "phone" | "computer";
const HIDE_BANNER = "wasl-install-banner-hidden";

function InstallSteps({ device }: { device: Device }) {
  if (device === "ios")
    return (
      <ol className="install-steps">
        <li>
          Tap <Share size={15} aria-label="Share" /> <strong>Share</strong> at
          the bottom of Safari. On newer iPhones, tap <strong>•••</strong>{" "}
          first, then Share.
        </li>
        <li>
          Scroll down and tap <SquarePlus size={15} aria-hidden="true" />{" "}
          <strong>Add to Home Screen</strong> (under <strong>View More</strong>{" "}
          if you don&rsquo;t see it).
        </li>
        <li>
          Tap <strong>Add</strong>. Wasl appears with your apps.
        </li>
        <li className="install-hint">
          Opened from WhatsApp or Instagram? Open the link in Safari first.
        </li>
      </ol>
    );
  return (
    <ol className="install-steps">
      <li>
        Tap <strong>⋮</strong> at the top right of Chrome.
      </li>
      <li>
        Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
      </li>
      <li className="install-hint">
        Opened from WhatsApp? Tap ⋮ then <strong>Open in Chrome</strong> first.
      </li>
    </ol>
  );
}

// The full block (sign-in on laptops, Settings) or, with `banner`, a slim bar for the top of phone screens.
export function InstallApp({
  banner = false,
  computerOnly = false,
}: {
  banner?: boolean;
  computerOnly?: boolean;
}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [steps, setSteps] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [qr, setQr] = useState("");
  useEffect(() => {
    const ua = navigator.userAgent;
    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    setDevice(ios ? "ios" : /android|mobile/i.test(ua) ? "phone" : "computer");
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    try {
      setHidden(localStorage.getItem(HIDE_BANNER) === "1");
    } catch {}
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  useEffect(() => {
    if (banner || device !== "computer") return;
    let active = true;
    QRCode.toDataURL(window.location.origin, {
      width: 360,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#1c303d", light: "#ffffff" },
    })
      .then((image) => active && setQr(image))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [banner, device]);
  if (!device || (computerOnly && device !== "computer")) return null;
  async function install() {
    if (!prompt) return setSteps((open) => !open);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }
  if (banner) {
    if (device === "computer" || installed || hidden) return null;
    return (
      <div className="install-banner" role="region" aria-label="Get the app">
        <div className="install-banner-row">
          <img src="/icon-192.png" alt="" width={34} height={34} />
          <span>
            <strong>Get the app</strong>
            <span>Add Wasl to your phone</span>
          </span>
          <Button
            className="install-banner-button"
            onClick={install}
            aria-expanded={prompt ? undefined : steps}
          >
            <Download size={15} /> Install
          </Button>
          <button
            className="icon-button"
            aria-label="Hide this"
            onClick={() => {
              setHidden(true);
              try {
                localStorage.setItem(HIDE_BANNER, "1");
              } catch {}
            }}
          >
            <X size={16} />
          </button>
        </div>
        {steps && !prompt ? <InstallSteps device={device} /> : null}
      </div>
    );
  }
  if (installed)
    return (
      <div className="install-app done">
        <Check size={18} /> Wasl is installed on this device.
      </div>
    );
  return (
    <div className="install-app">
      <div className="install-app-text">
        <strong>
          <Smartphone size={17} /> Get the Wasl app
        </strong>
        <span>
          {device === "computer"
            ? "Scan with your phone's camera to open Wasl there, then install it."
            : "Add it to your home screen. It opens full screen, like any app."}
        </span>
      </div>
      {device === "computer" && qr ? (
        <img
          className="install-qr"
          src={qr}
          alt="QR code that opens Wasl on your phone"
          width={120}
          height={120}
        />
      ) : null}
      {device !== "computer" || prompt ? (
        <Button
          variant="secondary"
          className="full"
          onClick={install}
          aria-expanded={prompt ? undefined : steps}
        >
          <Download size={16} /> Install Wasl
        </Button>
      ) : null}
      {steps && !prompt ? <InstallSteps device={device} /> : null}
    </div>
  );
}
