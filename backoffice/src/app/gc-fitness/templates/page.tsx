// /gc-fitness/templates/page.tsx — list view (Server Component shell)
//
// Auth gate runs on the server BEFORE any client component mounts. Failure
// modes mirror the exercises list page:
//   - missing/invalid cookie → redirect to `/gc-fitness/login`
//   - server-misconfigured env → throws, surfaces Next.js 500
//
// Once verified, render `<TemplatesLibraryClient />` inside this route's
// local QueryClientProvider.

import { redirect } from "next/navigation";

import { getCurrentTrainer } from "@/lib/gc-fitness/auth-helpers";
import { TemplatesLibraryClient } from "./client";
import { TemplatesQueryProvider } from "./providers";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  try {
    await getCurrentTrainer();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Forbidden";
    if (message === "Forbidden") {
      redirect("/gc-fitness/login");
    }
    throw err;
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <TemplatesQueryProvider>
        <TemplatesLibraryClient />
      </TemplatesQueryProvider>
    </div>
  );
}
