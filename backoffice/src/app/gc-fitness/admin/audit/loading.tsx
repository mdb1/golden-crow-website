// /gc-fitness/admin/audit/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  HeaderSkeleton,
  PageSkeleton,
  RowListSkeleton,
  TabsSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function AdminAuditLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={1} />
      <TabsSkeleton count={4} />
      <RowListSkeleton rows={10} title={false} />
    </PageSkeleton>
  );
}
