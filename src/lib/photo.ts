// Turns a chosen photo into a small square JPEG (about 10 KB) on the phone, so a profile
// photo uploads fast and fits on every card, saved contact and vCard.
export async function squarePhoto(file: File, size = 192): Promise<string> {
  if (!file.type.startsWith("image/"))
    throw new Error("Please choose a photo.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That photo couldn't be opened."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't resize photos.");
    ctx.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    for (const quality of [0.82, 0.7, 0.55]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length < 50000) return data;
    }
    throw new Error("Please choose a smaller photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
