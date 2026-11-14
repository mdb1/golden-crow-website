// /gc-fitness/admin/coach-activity/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  HeaderSkeleton,
  PageSkeleton,
  RowListSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function AdminCoachActivityLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={1} />
      <RowListSkeleton rows={10} title={false} />
    </PageSkeleton>
  );
}
