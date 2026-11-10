"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, QrCode } from "lucide-react";
import { readContactCode } from "@/lib/contact-code";
import type { Profile } from "@/lib/types";
import { Button, Modal, Notice } from "./ui";

type Decoder = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" },
) => { data: string } | null;

// Reads a QR code with the phone camera, all on the phone. A Wasl code opens the person's
// card (where you can swap cards); a vCard code on a paper card becomes a new contact draft.
export function QrScanner({
  onClose,
  onContact,
}: {
  onClose: () => void;
  onContact: (profile: Profile) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const decoder = useRef<Decoder | null>(null);
  const done = useRef(false);
  const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
  const [message, setMessage] = useState("");
  const [found, setFound] = useState("");

  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  function handle(text: string) {
    if (done.current) return;
    const code = readContactCode(text, window.location.origin);
    if (code.kind === "wasl") {
      done.current = true;
      stop();
      setFound("Opening their card…");
      window.location.assign(code.path);
    } else if (code.kind === "contact") {
      done.current = true;
      stop();
      onContact(code.profile);
    } else if (code.kind === "link")
      setMessage(
        `That code opens ${code.host}. It isn't a Wasl card or a contact.`,
      );
    else setMessage("That code isn't a Wasl card or a contact.");
  }

  async function loadDecoder() {
    if (!decoder.current)
      decoder.current = (await import("jsqr")).default as unknown as Decoder;
    return decoder.current;
  }

  function decode(source: CanvasImageSource, w: number, h: number) {
    const scale = Math.min(1, 900 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !decoder.current) return null;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decoder.current(image.data, image.width, image.height, {
      inversionAttempts: "attemptBoth",
    });
  }

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      await loadDecoder();
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("off");
        setMessage(
          "This browser can't show a live camera. Take a photo of the code instead.",
        );
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!active) return media.getTracks().forEach((t) => t.stop());
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => {});
        }
        setCamera("on");
        const tick = () => {
          if (!active || done.current) return;
          const v = video.current;
          if (v && v.readyState >= 2 && v.videoWidth) {
            const result = decode(v, v.videoWidth, v.videoHeight);
            if (result?.data) handle(result.data);
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        setCamera("off");
        setMessage(
          (e as Error).name === "NotAllowedError"
            ? "Camera access is blocked. Allow it for this site, or take a photo of the code."
            : "The camera couldn't start. Take a photo of the code instead.",
        );
      }
    })();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      stop();
    };
  }, []);

  async function fromPhoto(file?: File) {
    if (!file) return;
    setMessage("");
    await loadDecoder();
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const result = decode(img, img.naturalWidth, img.naturalHeight);
      if (result?.data) handle(result.data);
      else
        setMessage(
          "No code found in that photo. Hold the phone closer so the code fills the frame.",
        );
    } catch {
      setMessage("That photo couldn't be opened.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <Modal
      title="Scan their code"
      description="Point the camera at their Wasl code, or at the QR code on a paper card."
      onClose={onClose}
    >
      <div className={`qr-viewfinder ${camera === "on" ? "live" : ""}`}>
        <video ref={video} playsInline muted aria-label="Camera" />
        {camera !== "on" ? (
          <div className="qr-viewfinder-msg">
            <QrCode size={34} />
            <span>
              {camera === "starting"
                ? "Starting the camera…"
                : "No live camera"}
            </span>
          </div>
        ) : null}
        <div className="qr-frame" aria-hidden="true" />
      </div>
      {found ? <Notice>{found}</Notice> : null}
      {message ? <Notice error>{message}</Notice> : null}
      <label className="button secondary full">
        <Camera size={16} /> Take a photo of the code
        <input
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void fromPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="muted small-copy">
        The camera picture stays on this phone. Only the code is read.
      </p>
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
