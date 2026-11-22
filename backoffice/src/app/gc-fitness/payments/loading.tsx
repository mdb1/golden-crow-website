// /gc-fitness/payments/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  HeaderSkeleton,
  PageSkeleton,
  StatGridSkeleton,
  TableSkeleton,
  TabsSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function PaymentsLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={2} />
      <StatGridSkeleton count={4} />
      <TabsSkeleton count={3} />
      <TableSkeleton rows={8} cols={5} />
    </PageSkeleton>
  );
}
