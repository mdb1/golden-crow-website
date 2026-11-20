// /gc-fitness/admin/coach-less-users/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function AdminCoachlessUsersLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={1} />
      <TableSkeleton rows={10} cols={5} />
    </PageSkeleton>
  );
}
