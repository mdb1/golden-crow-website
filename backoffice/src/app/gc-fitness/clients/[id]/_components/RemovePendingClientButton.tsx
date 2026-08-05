// RemovePendingClientButton.tsx — issue #753, deleting a PENDING client.
//
// The pending view is the one place a coach can undo a mistyped invite: until
// the person signs in there is no account, only a `/user_mirror/{email}`
// placeholder plus whatever was pre-loaded against that email. Both go.
//
// Copy is hardcoded Spanish to match the surrounding PendingClientView, which
// is not translated either (the whole "Pendiente de ingreso" card is Spanish).
// Mixing a translated button into an untranslated card would read worse than
// either choice on its own.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { removePendingClient } from "@/lib/gc-fitness/user-actions";

export function RemovePendingClientButton({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    startTransition(async () => {
      try {
        await removePendingClient({ email });
        toast.success(`${email} ya no está en tu lista de clientes.`);
        setOpen(false);
        // The mirror is gone, so this route 404s on the next render.
        router.replace("/gc-fitness/clients");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error && err.message !== "Forbidden"
            ? err.message
            : "No se pudo eliminar el cliente pendiente.",
        );
      }
    });
  };

  return (
    <section className="rounded-[1.25rem] border border-destructive/30 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">Eliminar cliente pendiente</h2>
          <p className="text-sm text-muted-foreground">
            Saca la invitación de tu lista y borra los workouts y hábitos que le
            hayas pre-cargado. No hay ninguna cuenta que eliminar: esta persona
            todavía no ingresó.
          </p>
        </div>
        <Button
          variant="outline"
          className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-4" />
          Eliminar
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra la invitación y todo el contenido pre-cargado para esta
              persona. Si más adelante ingresa a la app, ya no va a quedar
              vinculada a vos: para volver a tenerla como cliente vas a tener
              que invitarla de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Eliminando…" : "Eliminar cliente pendiente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
