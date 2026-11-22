// /gc-fitness/admin/usage/loading.tsx — golden-crow-website#530 (same pattern as #492).
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  HeaderSkeleton,
  PageSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function AdminUsageLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={1} />
      <StatGridSkeleton count={4} />
      <TableSkeleton rows={8} cols={5} />
    </PageSkeleton>
  );
}
