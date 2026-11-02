"use client";
import { useEffect, useState } from "react";
import { Check, Download, Share, Smartphone, SquarePlus } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "./ui";

// Chrome, Edge and Samsung Internet offer this event; Safari doesn't, so iPhones get steps instead.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Device = "ios" | "phone" | "computer";

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [steps, setSteps] = useState(false);
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
    if (device !== "computer") return;
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
  }, [device]);
  if (!device) return null;
  if (installed)
    return (
      <div className="install-app done">
        <Check size={18} /> Wasl is installed on this device.
      </div>
    );
  async function install() {
    if (!prompt) return setSteps((open) => !open);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }
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
      {steps && !prompt ? (
        device === "ios" ? (
          <ol className="install-steps">
            <li>
              Tap <Share size={15} aria-label="Share" /> in Safari&rsquo;s
              toolbar.
            </li>
            <li>
              Choose <SquarePlus size={15} aria-hidden="true" />{" "}
              <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>. Wasl appears with your apps.
            </li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>Open your browser&rsquo;s menu (⋮).</li>
            <li>
              Choose <strong>Install app</strong> or{" "}
              <strong>Add to Home screen</strong>.
            </li>
          </ol>
        )
      ) : null}
    </div>
  );
}
