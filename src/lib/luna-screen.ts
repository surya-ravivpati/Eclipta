// Captures a single frame from the user's screen via getDisplayMedia, returns base64 PNG data URL.
// Stops the stream immediately after capture so the browser doesn't keep sharing.
export async function captureScreenFrame(): Promise<string | null> {
  try {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen capture not supported in this browser.");
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
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Stop sharing immediately
    track.stop();
    stream.getTracks().forEach((t) => t.stop());

    return canvas.toDataURL("image/jpeg", 0.7);
  } catch (e) {
    if ((e as Error).name === "NotAllowedError") return null;
    console.error("Screen capture failed:", e);
    return null;
  }
}
