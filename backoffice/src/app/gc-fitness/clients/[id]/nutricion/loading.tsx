// /gc-fitness/clients/[id]/nutricion/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  CardGridSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function ClientNutritionLoading() {
  return (
    <PageSkeleton variant="subpage">
      <HeaderSkeleton actions={2} back />
      <StatGridSkeleton count={4} />
      <CardGridSkeleton count={2} columns={2} bodyClassName="h-40" />
      <TableSkeleton rows={5} cols={4} />
    </PageSkeleton>
  );
}
