// Captures a single frame from the user's screen via getDisplayMedia.
// Returns { dataUrl } on success, or { error } describing why it failed
// (denied, unsupported, generic) so callers can surface a toast.
export type ScreenCaptureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: "denied" | "unsupported" | "failed"; message: string };

export async function captureScreenFrame(): Promise<ScreenCaptureResult> {
  try {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      return { ok: false, error: "unsupported", message: "Screen sharing isn't supported in this browser." };
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // Wait one frame for video to actually get pixels
    await new Promise((r) => setTimeout(r, 250));

    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    // Scale down to keep payload small (max 1280px wide)
    const scale = Math.min(1, 1280 / w);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, error: "failed", message: "Couldn't capture the screen frame." };
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Stop sharing immediately
    track.stop();
    stream.getTracks().forEach((t) => t.stop());

    return { ok: true, dataUrl: canvas.toDataURL("image/jpeg", 0.7) };
  } catch (e) {
    const name = (e as Error).name;
    if (name === "NotAllowedError") {
      return { ok: false, error: "denied", message: "Screen sharing was denied. You can try again when you're ready." };
    }
    console.error("Screen capture failed:", e);
    return { ok: false, error: "failed", message: "Screen capture failed. Try again in a moment." };
  }
}
