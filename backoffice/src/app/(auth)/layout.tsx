import { AmbientBackdrop } from "@/components/ambient-backdrop";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-10">
      <AmbientBackdrop />
      <div className="relative z-10 w-full max-w-6xl">{children}</div>
    </div>
  );
}
