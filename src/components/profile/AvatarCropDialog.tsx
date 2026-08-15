import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  IDENTITY_TRANSFORM,
  MAX_ZOOM,
  MIN_ZOOM,
  clampTransform,
  coverScale,
  renderCroppedAvatar,
  zoomAboutCentre,
  type CropTransform,
  type CropView,
  type ImageSize,
} from "./avatar-crop";

/** Wheel notches are ~100 deltaY, so this makes one notch about a 16% zoom step. */
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

export interface AvatarCropDialogProps {
  /** The photo the user picked. Already validated for type and size. */
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: Blob) => void;
}

interface DragOrigin {
  pointerId: number;
  clientX: number;
  clientY: number;
  transform: CropTransform;
}

/**
 * Circular crop step between picking a photo and uploading it.
 *
 * Avatars render as circles everywhere in the app, so uploading raw meant the
 * browser's centre-crop decided what got cut off - which for most phone photos
 * is the subject's head. Pan and zoom only: rotation and filters were
 * deliberately left out.
 */
export function AvatarCropDialog({ file, onCancel, onConfirm }: AvatarCropDialogProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragOrigin | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [frame, setFrame] = useState(0);
  const [transform, setTransform] = useState<CropTransform>(IDENTITY_TRANSFORM);
  const [saving, setSaving] = useState(false);

  // Created in an effect, not during render, so the cleanup that revokes it is
  // always paired with the URL it revokes - including under StrictMode's
  // double-invoke, where a render-time URL would be revoked and never replaced.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageSize(null);
    setTransform(IDENTITY_TRANSFORM);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The frame is fluid, and offsets are measured in its pixels, so a resize
  // (rotating a phone, mostly) has to re-clamp the pan.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured !== undefined) setFrame(measured);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const view = useMemo<CropView | null>(
    () => (imageSize && frame > 0 ? { image: imageSize, frame } : null),
    [imageSize, frame],
  );

  useEffect(() => {
    if (view) setTransform((current) => clampTransform(view, current));
  }, [view]);

  const setZoom = useCallback(
    (zoom: number) => {
      if (view) setTransform((current) => zoomAboutCentre(view, current, zoom));
    },
    [view],
  );

  // React routes wheel through a passive root listener, so the zoom gesture has
  // to bind natively to stop the page scrolling behind the dialog.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !view) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setTransform((current) =>
        zoomAboutCentre(
          view,
          current,
          current.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
        ),
      );
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [view]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!view) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      transform,
    };
  };

  const continueDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragRef.current;
    if (!origin || !view || origin.pointerId !== event.pointerId) return;
    setTransform(
      clampTransform(view, {
        zoom: origin.transform.zoom,
        offsetX: origin.transform.offsetX + (event.clientX - origin.clientX),
        offsetY: origin.transform.offsetY + (event.clientY - origin.clientY),
      }),
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const save = async () => {
    const image = imageRef.current;
    if (!image || !view) return;
    setSaving(true);
    try {
      onConfirm(await renderCroppedAvatar(image, view, transform));
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : "Could not crop that photo.");
    }
  };

  const scale = view ? coverScale(view) * transform.zoom : 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display tracking-widest uppercase text-base">
            Position your photo
          </DialogTitle>
          <DialogDescription>
            Drag to reposition and zoom to fill the circle. Only what is inside the circle is saved.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={stageRef}
          onPointerDown={startDrag}
          onPointerMove={continueDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // A letterbox behind media stays dark in both themes.
          // eslint-disable-next-line vibesafe/theme-aware-colors
          className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-md bg-black/60 touch-none cursor-grab active:cursor-grabbing"
        >
          {imageUrl && (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Selected photo"
              draggable={false}
              onLoad={(event) =>
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={
                view
                  ? {
                      width: view.image.width * scale,
                      height: view.image.height * scale,
                      transform: `translate(calc(-50% + ${transform.offsetX}px), calc(-50% + ${transform.offsetY}px))`,
                    }
                  : { opacity: 0 }
              }
            />
          )}
          {/* One huge spread shadow dims everything outside the circle, which the
              stage's overflow clips back to the crop area. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border border-foreground/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          />
        </div>

        <div className="flex items-center gap-3 mx-auto w-full max-w-[320px]">
          <ZoomOut aria-hidden className="w-4 h-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            aria-label="Zoom"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={transform.zoom}
            disabled={!view}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="w-full accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
          />
          <ZoomIn aria-hidden className="w-4 h-4 shrink-0 text-muted-foreground" />
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="text-xs font-bold tracking-widest"
          >
            CANCEL
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!view || saving}
            className="text-xs font-bold tracking-widest"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            SAVE PHOTO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
