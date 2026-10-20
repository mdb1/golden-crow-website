"use client";

import { useState } from "react";
import { KeyRound, Loader2, LogIn } from "lucide-react";
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
import {
  signInSdkSessionWithGoogle,
  signInSdkSessionWithPassword,
  type SdkSessionIdentity,
} from "@/lib/sdk-session-recovery";

type RecoveryMethod = "password" | "google";

export function SdkSessionRecoveryDialog({
  open,
  identity,
  onOpenChange,
  onRecovered,
}: {
  open: boolean;
  identity: SdkSessionIdentity;
  onOpenChange: (open: boolean) => void;
  onRecovered: () => Promise<boolean> | boolean;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [password, setPassword] = useState("");
  const [method, setMethod] = useState<RecoveryMethod | null>(null);
  const [error, setError] = useState("");
  const working = method !== null;

  function changeOpen(nextOpen: boolean) {
    if (working) return;
    if (!nextOpen) {
      setPassword("");
      setError("");
    }
    onOpenChange(nextOpen);
  }

  async function recover(nextMethod: RecoveryMethod) {
    setMethod(nextMethod);
    setError("");
    try {
      if (nextMethod === "password") {
        await signInSdkSessionWithPassword(identity, password);
      } else {
        await signInSdkSessionWithGoogle(identity);
      }
      setPassword("");
      const completed = await onRecovered();
      if (completed) {
        onOpenChange(false);
      } else {
        setError(t("The session is still unavailable. Try signing in again."));
      }
    } catch (recoveryError) {
      setError(
        recoveryError instanceof Error
          ? recoveryError.message
          : t("The session could not be renewed."),
      );
    } finally {
      setMethod(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={changeOpen}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
            <KeyRound className="h-5 w-5" />
          </div>
          <DialogTitle>{t("Your session expired")}</DialogTitle>
          <DialogDescription>
            {t(
              "Sign in here to continue. Your service offer and current step will stay unchanged.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="sdk-session-email">{t("Email")}</Label>
            <Input
              id="sdk-session-email"
              value={identity.email}
              readOnly
              aria-readonly="true"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sdk-session-password">{t("Password")}</Label>
            <Input
              id="sdk-session-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={working}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {t(error)}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={() => void recover("password")}
            disabled={working || !password}
          >
            {method === "password" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {t("Sign in with password")}
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>{t("or")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void recover("google")}
            disabled={working}
          >
            {method === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {t("Continue with Google")}
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => changeOpen(false)}
            disabled={working}
          >
            {t("Not now")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
