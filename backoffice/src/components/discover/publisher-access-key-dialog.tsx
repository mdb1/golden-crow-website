"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Save,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appText } from "@/lib/language";
import { sdkFetch } from "@/lib/sdk-client";

type CredentialStatus = { available: boolean; contactEmail: string | null };

export function PublisherAccessKeyDialog({
  publisherId,
  publisherKind,
}: {
  publisherId: string;
  publisherKind: "organization" | "individual";
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [key, setKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const endpoint = `/discover/publisher-credentials/${publisherKind}/${encodeURIComponent(publisherId)}`;

  function close() {
    if (pending) return;
    setOpen(false);
    setStatus(null);
    setKey("");
    setRevealed(false);
    setError("");
    setSaved(false);
    setCopied(false);
  }

  async function show() {
    setOpen(true);
    setPending(true);
    setError("");
    try {
      setStatus(await sdkFetch<CredentialStatus>(endpoint));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("Unable to load the publisher access key."),
      );
    } finally {
      setPending(false);
    }
  }

  async function reveal() {
    if (revealed) {
      setRevealed(false);
      if (status?.available) setKey("");
      return;
    }
    if (!status?.available) {
      setRevealed(true);
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await sdkFetch<{ accessKey: string; email: string }>(
        `${endpoint}/reveal`,
        { method: "POST" },
      );
      setKey(result.accessKey);
      setStatus({ available: true, contactEmail: result.email });
      setRevealed(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("Unable to reveal the publisher access key."),
      );
    } finally {
      setPending(false);
    }
  }

  async function save() {
    setPending(true);
    setError("");
    try {
      await sdkFetch(endpoint, {
        method: "PUT",
        body: JSON.stringify({ accessKey: key }),
      });
      setStatus((current) =>
        current ? { ...current, available: true } : current,
      );
      setKey("");
      setRevealed(false);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("Unable to save the publisher access key."),
      );
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setError(t("Unable to copy the access key."));
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200"
        onClick={() => void show()}
      >
        <KeyRound className="size-4" />
        {t("Portal access key")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-violet-600" />
              {t("Portal access key")}
            </DialogTitle>
            <DialogDescription>
              {status?.available
                ? t("Reveal the saved key for this publisher.")
                : t(
                    "Save the current key to include it in partner email links.",
                  )}
            </DialogDescription>
          </DialogHeader>
          {pending && !status ? (
            <div role="status" className="flex items-center gap-2 py-8">
              <Loader2 className="size-4 animate-spin" />
              {t("Loading...")}
            </div>
          ) : null}
          {status ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-violet-50 p-3 text-sm dark:bg-violet-950">
                <span className="text-muted-foreground">{t("Contact email")}</span>
                <p className="break-all font-medium">
                  {status.contactEmail || t("No contact email")}
                </p>
              </div>
              {!status.available ? (
                <p role="note" className="text-sm text-muted-foreground">
                  {t("This publisher does not have a saved access key.")}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="publisher-portal-access-key">
                  {t("Access key")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="publisher-portal-access-key"
                    type={revealed ? "text" : "password"}
                    value={status.available && !revealed ? "********" : key}
                    readOnly={status.available}
                    onChange={(event) => {
                      setKey(event.target.value);
                      setSaved(false);
                    }}
                    autoComplete="off"
                    maxLength={256}
                    className="min-h-12 font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void reveal()}
                    disabled={pending}
                    className="min-h-12"
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : revealed ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    {revealed ? t("Hide") : t("Reveal")}
                  </Button>
                </div>
                {!status.available ? (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Enter the existing Firebase access key. Saving it here does not change the account password.",
                    )}
                  </p>
                ) : null}
              </div>
              {saved ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"
                >
                  <Check className="size-4" />
                  {t("Access key saved.")}
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {t(error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={close}
            >
              {t("Close")}
            </Button>
            {status?.available ? (
              <Button
                type="button"
                disabled={pending || !revealed || !key}
                onClick={() => void copy()}
              >
                <Copy className="size-4" />
                {copied ? t("Copied") : t("Copy")}
              </Button>
            ) : status ? (
              <Button
                type="button"
                className="bg-violet-600 text-white hover:bg-violet-700"
                disabled={
                  pending ||
                  key.length < 6 ||
                  !key.trim() ||
                  !status.contactEmail
                }
                onClick={() => void save()}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {t("Save access key")}
              </Button>
            ) : (
              <Button type="button" onClick={() => void show()}>
                {t("Retry")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
