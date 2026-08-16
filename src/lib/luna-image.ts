import { toast } from "sonner";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIM = 1280;
const JPEG_QUALITY = 0.82;

/** Validate an uploaded image file and return a downscaled JPEG data URL. */
export async function processUserImage(file: File): Promise<string | null> {
  if (!ALLOWED_MIME.has(file.type)) {
    toast.error("Only PNG, JPEG, WebP, or GIF images are supported.");
    return null;
  }
  if (file.size > MAX_BYTES) {
    toast.error("Image is too large (max 8 MB).");
    return null;
  }
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error ?? new Error("read failed"));
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return null;
    // Animated GIFs would lose animation when re-encoded; pass them through as-is.
    if (file.type === "image/gif") return dataUrl;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = dataUrl;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return dataUrl;
    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    if (scale === 1 && file.size < 1024 * 1024) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    toast.error("Couldn't read that image. Try a different file.");
    return null;
  }
}
