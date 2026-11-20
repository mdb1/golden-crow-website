// /gc-fitness/admin/loading.tsx — #492.
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

export default function AdminLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={2} />
      <StatGridSkeleton count={4} />
      <TableSkeleton rows={8} cols={5} />
      <CardGridSkeleton count={2} columns={2} bodyClassName="h-24" />
    </PageSkeleton>
  );
}
