"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getGCFitnessAuth } from "@/lib/firebase/gc-fitness-client";
import { updateTrainerProfile } from "@/lib/gc-fitness/user-actions";

export function CoachProfileForm({
  uid,
  email,
  initialDisplayName,
  initialPhotoURL,
  initialBio,
}: {
  uid: string;
  email: string;
  initialDisplayName: string;
  initialPhotoURL: string | null;
  initialBio: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("settings.coachProfile");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio ?? "");
  const [photoURL, setPhotoURL] = useState<string | null>(initialPhotoURL);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const previewURL = useMemo(() => {
    if (!pickedFile) return photoURL;
    return URL.createObjectURL(pickedFile);
  }, [pickedFile, photoURL]);

  useEffect(() => {
    setImageFailed(false);
  }, [previewURL]);

  // The Save button is disabled until the coach actually changes something —
  // a new photo was picked, or the display name / description differs from
  // what was loaded. After a successful save, `router.refresh()` re-supplies
  // the initial props (now equal to the edited state), so this flips back to
  // false and the button disables again.
  const isDirty = useMemo(
    () =>
      pickedFile !== null ||
      displayName !== initialDisplayName ||
      bio !== (initialBio ?? "") ||
      photoURL !== initialPhotoURL,
    [pickedFile, displayName, bio, photoURL, initialDisplayName, initialBio, initialPhotoURL],
  );

  async function handleSubmit() {
    startTransition(async () => {
      try {
        let resolvedPhotoURL = photoURL;
        if (pickedFile) {
          // Issue #166 (round 2) — upload through the trainer-authenticated
          // server route instead of the Firebase JS client SDK. The
          // backoffice session lives in next-firebase-auth-edge COOKIES; the
          // browser-side Firebase Auth context is separate and unreliable
          // (absent / different account), and when it doesn't match the
          // trainer, Storage rules reject the client upload with
          // `storage/unauthorized`. The server route is gated by the same
          // cookie every other backoffice write trusts, and uploads via the
          // Admin SDK. Compression stays client-side (bandwidth + consistent
          // avatar sizing across surfaces).
          const compressed = await compressImageToJpeg(pickedFile);
          const response = await fetch("/api/gc-fitness/coach-profile-photo", {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body: compressed,
          });
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(payload?.error ?? t("saveFailedToast"));
          }
          const { photoURL: uploadedURL } = (await response.json()) as {
            photoURL: string;
          };
          resolvedPhotoURL = uploadedURL;
          setPhotoURL(resolvedPhotoURL);
          setPickedFile(null);
        }

        await updateTrainerProfile({
          displayName: displayName.trim().length > 0 ? displayName.trim() : email,
          photoURL: resolvedPhotoURL,
          bio: bio.trim().length > 0 ? bio.trim() : null,
        });
        toast.success(t("savedToast"));
        router.refresh();
      } catch (err) {
        console.error("[coach-profile-form] save failed", err);
        toast.error(err instanceof Error ? err.message : t("saveFailedToast"));
      }
    });
  }

  return (
    <section className="rounded-[1.25rem] border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mb-5 flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
          {previewURL && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewURL}
              alt=""
              className="h-full w-full object-cover"
              onError={() => {
                const authPhotoURL = getGCFitnessAuth().currentUser?.photoURL ?? null;
                if (authPhotoURL && authPhotoURL !== photoURL) {
                  setPhotoURL(authPhotoURL);
                  setImageFailed(false);
                  return;
                }
                setImageFailed(true);
              }}
            />
          ) : (
            <span className="text-xl font-semibold text-muted-foreground">
              {displayName.trim().charAt(0).toUpperCase() || "C"}
            </span>
          )}
        </div>
        <div className="space-y-2">
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            {t("photoCta")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("photoHelp")}</p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          setPickedFile(file);
        }}
      />

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="coach-display-name">{t("displayNameLabel")}</Label>
          <Input
            id="coach-display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={t("displayNamePlaceholder")}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="coach-bio">{t("bioLabel")}</Label>
          <Textarea
            id="coach-bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={4}
            placeholder={t("bioPlaceholder")}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("emailHint", { email })}</p>
          <Button type="button" onClick={handleSubmit} disabled={pending || !isDirty}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * Downscale + JPEG-compress an arbitrary image File to a Blob that fits the
 * `profile_photos` Storage-rule 1 MB cap (twin of the apps' avatar
 * normalization). Caps the longest side at `maxDimension` and steps the JPEG
 * quality down until the result is under `maxBytes` (well below 1 MB so the
 * rule never rejects it).
 */
async function compressImageToJpeg(
  file: File,
  maxDimension = 1024,
  maxBytes = 900 * 1024,
): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode image"));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, width, height);

  const toBlob = (quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
        "image/jpeg",
        quality,
      );
    });

  let quality = 0.85;
  let blob = await toBlob(quality);
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.15;
    blob = await toBlob(quality);
  }
  return blob;
}
