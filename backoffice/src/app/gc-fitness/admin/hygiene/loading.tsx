// /gc-fitness/admin/hygiene/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function AdminHygieneLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={1} />
      <TableSkeleton rows={10} cols={4} />
    </PageSkeleton>
  );
}
