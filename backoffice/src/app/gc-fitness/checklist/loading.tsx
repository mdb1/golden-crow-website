// /gc-fitness/checklist/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  HeaderSkeleton,
  PageSkeleton,
  RowListSkeleton,
  TabsSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function ChecklistLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={1} />
      <TabsSkeleton count={3} />
      <RowListSkeleton rows={8} title={false} />
    </PageSkeleton>
  );
}
