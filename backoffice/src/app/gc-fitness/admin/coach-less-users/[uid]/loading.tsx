// /gc-fitness/admin/coach-less-users/[uid]/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  HeaderSkeleton,
  PageSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function AdminCoachlessUserDetailLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={2} back />
      <StatGridSkeleton count={4} />
      <TableSkeleton rows={8} cols={4} />
    </PageSkeleton>
  );
}
