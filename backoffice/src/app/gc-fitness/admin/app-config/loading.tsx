// /gc-fitness/admin/app-config/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  CardGridSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function AdminAppConfigLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={0} />
      <CardGridSkeleton count={2} columns={2} bodyClassName="h-40" />
    </PageSkeleton>
  );
}
