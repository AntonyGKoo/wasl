"use client";
import type { OcrLine } from "./card-text";

// Reads a card photo on the phone itself with tesseract.js, served from /ocr (see scripts/copy-ocr.mjs).
// Used when no cloud OCR key is configured; the photo never leaves the device.
type Worker = {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(image: HTMLCanvasElement): Promise<{
    data: { text: string; lines: OcrLine[] };
  }>;
};
type Tesseract = {
  createWorker(
    lang: string,
    oem: number,
    options: Record<string, unknown>,
  ): Promise<Worker>;
};
type Progress = (status: string, share: number) => void;

let worker: Promise<Worker> | null = null;
let report: Progress = () => {};

function loadScript() {
  const w = window as unknown as { Tesseract?: Tesseract };
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  return new Promise<Tesseract>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/ocr/tesseract.min.js";
    s.onload = () => resolve(w.Tesseract!);
    s.onerror = () => reject(new Error("The card reader could not load."));
    document.head.appendChild(s);
  });
}

function getWorker() {
  worker ??= loadScript()
    .then((t) =>
      t.createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr/lang",
        // a same-origin worker file instead of a blob: the security policy allows only our own files
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text")
            report("Reading the card…", 0.2 + m.progress * 0.8);
          else if (/loading|initializ/.test(m.status))
            report(
              "Getting the reader ready (first time only)…",
              0.2 * (m.progress || 0),
            );
        },
      }),
    )
    // "sparse text" finds text scattered around a card; the default can skip the big name line
    .then(async (w) => {
      await w.setParameters({ tessedit_pageseg_mode: "11" });
      return w;
    })
    .catch((e) => {
      worker = null;
      throw e;
    });
  return worker;
}

// Phone photos are large: shrink and turn grey first, which is faster and reads better.
async function prepare(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(1.2)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function readCardPhoto(file: File, onProgress: Progress) {
  report = onProgress;
  onProgress("Getting the reader ready…", 0);
  const [w, image] = await Promise.all([getWorker(), prepare(file)]);
  const { data } = await w.recognize(image);
  onProgress("Done", 1);
  return { text: data.text, lines: data.lines };
}
