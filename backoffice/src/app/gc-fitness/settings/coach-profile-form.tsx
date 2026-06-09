"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadBytes, ref, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getGCFitnessAuth, getGCFitnessStorage } from "@/lib/firebase/gc-fitness-client";
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

  async function handleSubmit() {
    startTransition(async () => {
      try {
        let resolvedPhotoURL = photoURL;
        if (pickedFile) {
          const storage = getGCFitnessStorage();
          const path = `profile_photos/${uid}/avatar.jpg`;
          const uploadRef = ref(storage, path);
          await uploadBytes(uploadRef, pickedFile, {
            contentType: pickedFile.type || "image/jpeg",
          });
          resolvedPhotoURL = await getDownloadURL(uploadRef);
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
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </section>
  );
}
