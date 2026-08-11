import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampTransform,
  cropSourceRect,
  zoomAboutCentre,
  type CropTransform,
  type CropView,
} from "./avatar-crop";

const square: CropView = { image: { width: 1000, height: 1000 }, frame: 320 };
const landscape: CropView = { image: { width: 2000, height: 1000 }, frame: 320 };
const portrait: CropView = { image: { width: 1000, height: 2000 }, frame: 320 };

const identity: CropTransform = { zoom: 1, offsetX: 0, offsetY: 0 };

describe("clampTransform", () => {
  it("holds zoom inside the allowed range", () => {
    expect(clampTransform(square, { ...identity, zoom: 0.2 }).zoom).toBe(MIN_ZOOM);
    expect(clampTransform(square, { ...identity, zoom: 99 }).zoom).toBe(MAX_ZOOM);
  });

  it("pins a square image at the centre when it only just covers the frame", () => {
    const clamped = clampTransform(square, { zoom: 1, offsetX: 500, offsetY: -500 });
    expect(clamped.offsetX).toBe(0);
    expect(clamped.offsetY).toBe(0);
  });

  it("allows panning along the long axis of a landscape image, but not the short one", () => {
    // Cover-fitted, a 2:1 image is 640x320 behind a 320px frame: 160px of
    // overhang each side horizontally, none vertically.
    const clamped = clampTransform(landscape, { zoom: 1, offsetX: 400, offsetY: 400 });
    expect(clamped.offsetX).toBe(160);
    expect(clamped.offsetY).toBe(0);
  });

  it("allows panning along the long axis of a portrait image", () => {
    const clamped = clampTransform(portrait, { zoom: 1, offsetX: -400, offsetY: -400 });
    expect(clamped.offsetX).toBe(0);
    expect(clamped.offsetY).toBe(-160);
  });

  it("widens the pan range as zoom grows", () => {
    const clamped = clampTransform(square, { zoom: 2, offsetX: 1000, offsetY: 0 });
    // 320px frame at 2x is 640px of image: 160px of overhang each side.
    expect(clamped.offsetX).toBe(160);
  });

  it("treats a zero-sized image as unpannable rather than dividing by zero", () => {
    const empty: CropView = { image: { width: 0, height: 0 }, frame: 320 };
    const clamped = clampTransform(empty, { zoom: 1, offsetX: 50, offsetY: 50 });
    expect(clamped.offsetX).toBe(0);
    expect(clamped.offsetY).toBe(0);
  });
});

describe("zoomAboutCentre", () => {
  it("keeps the point under the middle of the frame fixed while zooming in", () => {
    const before = clampTransform(landscape, { zoom: 1, offsetX: 100, offsetY: 0 });
    const after = zoomAboutCentre(landscape, before, 2);
    expect(
      cropSourceRect(landscape, after).x + cropSourceRect(landscape, after).size / 2,
    ).toBeCloseTo(cropSourceRect(landscape, before).x + cropSourceRect(landscape, before).size / 2);
  });

  it("pulls the image back inside the frame when zooming out uncovers an edge", () => {
    const zoomedIn = clampTransform(square, { zoom: 3, offsetX: 320, offsetY: 0 });
    expect(zoomAboutCentre(square, zoomedIn, 1).offsetX).toBe(0);
  });
});

describe("cropSourceRect", () => {
  it("takes the whole of a centred square image at 1x", () => {
    expect(cropSourceRect(square, identity)).toEqual({ x: 0, y: 0, size: 1000 });
  });

  it("takes the middle square of a centred landscape image at 1x", () => {
    expect(cropSourceRect(landscape, identity)).toEqual({ x: 500, y: 0, size: 1000 });
  });

  it("takes the left edge when the image is dragged fully right", () => {
    const dragged = clampTransform(landscape, { zoom: 1, offsetX: 1000, offsetY: 0 });
    expect(cropSourceRect(landscape, dragged)).toEqual({ x: 0, y: 0, size: 1000 });
  });

  it("halves the sampled region at 2x zoom", () => {
    expect(cropSourceRect(square, { ...identity, zoom: 2 })).toEqual({ x: 250, y: 250, size: 500 });
  });

  it("never samples outside the image, however hard the transform is pushed", () => {
    const pushed = clampTransform(portrait, { zoom: 2.5, offsetX: 9999, offsetY: -9999 });
    const rect = cropSourceRect(portrait, pushed);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.size).toBeLessThanOrEqual(portrait.image.width);
    expect(rect.y + rect.size).toBeLessThanOrEqual(portrait.image.height);
  });

  it("clamps an unclamped transform rather than trusting the caller", () => {
    expect(cropSourceRect(square, { zoom: 1, offsetX: 5000, offsetY: 0 })).toEqual({
      x: 0,
      y: 0,
      size: 1000,
    });
  });
});
