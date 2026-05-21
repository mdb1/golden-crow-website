import { GCFitnessShell } from "@/components/gc-fitness/gc-fitness-shell";

export default function GCFitnessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GCFitnessShell>{children}</GCFitnessShell>;
}
