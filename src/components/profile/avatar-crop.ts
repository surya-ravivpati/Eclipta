/**
 * Geometry for the circular avatar crop.
 *
 * The model is deliberately screen-first, because that is what the user is
 * manipulating: the image is laid out "cover" behind a square frame (the crop
 * circle is inscribed in it), and the transform is how far the *displayed*
 * image has been dragged and zoomed. Keeping offsets in frame pixels means the
 * drag handler is a straight pointer-delta with no conversion, and the one
 * place that has to think in image pixels is the canvas export.
 *
 * Everything here is pure so the invariant that matters - the crop circle can
 * never show empty space - is testable without a DOM.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/**
 * 512px covers every avatar slot we render (the largest is 80px, so this holds
 * up on 3x displays and leaves room to grow) while keeping a JPEG under ~100KB.
 */
export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_MIME_TYPE = "image/jpeg";
export const AVATAR_FILE_EXTENSION = "jpg";
export const AVATAR_JPEG_QUALITY = 0.9;

export interface ImageSize {
  width: number;
  height: number;
}

/** What is being cropped, and how big the crop frame is on screen. */
export interface CropView {
  /** Natural pixel size of the source image. */
  image: ImageSize;
  /** Side length of the square crop frame, in CSS pixels. */
  frame: number;
}

/** How the user has moved the image behind the frame. */
export interface CropTransform {
  /** Multiplier over the cover-fit baseline, between MIN_ZOOM and MAX_ZOOM. */
  zoom: number;
  /** Image centre relative to frame centre, in CSS pixels. */
  offsetX: number;
  offsetY: number;
}

/** The region of the source image the frame is currently showing, in image pixels. */
export interface CropSourceRect {
  x: number;
  y: number;
  size: number;
}

export const IDENTITY_TRANSFORM: CropTransform = { zoom: MIN_ZOOM, offsetX: 0, offsetY: 0 };

function clamp(value: number, lo: number, hi: number): number {
  const bounded = Math.max(lo, Math.min(hi, value));
  // Clamping to a zero-width range yields -0, which is `=== 0` but not
  // `Object.is` equal to it - enough to break comparisons downstream.
  return bounded === 0 ? 0 : bounded;
}

/** Scale at which the image exactly covers the frame - the 1x baseline. */
export function coverScale(view: CropView): number {
  const shortestSide = Math.min(view.image.width, view.image.height);
  return shortestSide > 0 ? view.frame / shortestSide : 0;
}

/** How far the image may travel before its edge crosses into the frame. */
function panLimit(displayedLength: number, frame: number): number {
  return Math.max(0, (displayedLength - frame) / 2);
}

/**
 * The transform the user actually gets: zoom inside range, and pan only as far
 * as the overhang allows. Applied on every input rather than trusted from the
 * caller, so no interaction path can leave a gap inside the circle.
 */
export function clampTransform(view: CropView, transform: CropTransform): CropTransform {
  const zoom = clamp(transform.zoom, MIN_ZOOM, MAX_ZOOM);
  const scale = coverScale(view) * zoom;
  const limitX = panLimit(view.image.width * scale, view.frame);
  const limitY = panLimit(view.image.height * scale, view.frame);
  return {
    zoom,
    offsetX: clamp(transform.offsetX, -limitX, limitX),
    offsetY: clamp(transform.offsetY, -limitY, limitY),
  };
}

/**
 * Change zoom while holding whatever sits under the middle of the frame in
 * place. Scaling the offset with the zoom is what does it: zooming out of a
 * corner otherwise walks the subject off-centre.
 */
export function zoomAboutCentre(
  view: CropView,
  transform: CropTransform,
  nextZoom: number,
): CropTransform {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = transform.zoom > 0 ? zoom / transform.zoom : 1;
  return clampTransform(view, {
    zoom,
    offsetX: transform.offsetX * ratio,
    offsetY: transform.offsetY * ratio,
  });
}

/** The square of source image the frame is showing, ready for `drawImage`. */
export function cropSourceRect(view: CropView, transform: CropTransform): CropSourceRect {
  const { zoom, offsetX, offsetY } = clampTransform(view, transform);
  const scale = coverScale(view) * zoom;
  if (scale <= 0) return { x: 0, y: 0, size: 0 };
  const size = view.frame / scale;
  return {
    x: view.image.width / 2 - offsetX / scale - size / 2,
    y: view.image.height / 2 - offsetY / scale - size / 2,
    size,
  };
}

/**
 * Draw the visible crop to a square canvas and encode it.
 *
 * Rejects rather than resolving null on encode failure: an avatar that silently
 * doesn't save is worse than one that says why.
 */
export async function renderCroppedAvatar(
  image: CanvasImageSource,
  view: CropView,
  transform: CropTransform,
): Promise<Blob> {
  const rect = cropSourceRect(view, transform);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get a 2D canvas context to crop the image.");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.size,
    rect.size,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not encode the cropped image."));
      },
      AVATAR_MIME_TYPE,
      AVATAR_JPEG_QUALITY,
    );
  });
}
