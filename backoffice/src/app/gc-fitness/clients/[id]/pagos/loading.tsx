// /gc-fitness/clients/[id]/pagos/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  CardGridSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function ClientPaymentsLoading() {
  return (
    <PageSkeleton variant="subpage">
      <HeaderSkeleton actions={1} back />
      <CardGridSkeleton count={2} columns={2} bodyClassName="h-20" />
      <TableSkeleton rows={6} cols={4} />
    </PageSkeleton>
  );
}
