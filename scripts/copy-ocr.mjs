// Copies the in-browser card reader (tesseract.js) into public/ocr so the app serves it itself:
// the strict content security policy only allows the app's own files. Runs before dev and build.
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public/ocr");
const from = (...p) => path.join(root, "node_modules", ...p);
await mkdir(path.join(out, "lang"), { recursive: true });
for (const [src, dest] of [
  [from("tesseract.js/dist/tesseract.min.js"), "tesseract.min.js"],
  [from("tesseract.js/dist/worker.min.js"), "worker.min.js"],
  // the reader picks the fastest build the phone supports
  [
    from("tesseract.js-core/tesseract-core-simd-lstm.wasm.js"),
    "tesseract-core-simd-lstm.wasm.js",
  ],
  [
    from("tesseract.js-core/tesseract-core-lstm.wasm.js"),
    "tesseract-core-lstm.wasm.js",
  ],
  [
    from("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"),
    "lang/eng.traineddata.gz",
  ],
])
  await cp(src, path.join(out, dest));
console.log("Card reader copied to public/ocr");
