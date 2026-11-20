// /gc-fitness/challenges/loading.tsx — #492.
//
// Instant skeleton while the server streams Firestore (shared blocks:
// components/gc-fitness/page-skeletons.tsx).

import {
  CardGridSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  TabsSkeleton,
} from "@/components/gc-fitness/page-skeletons";

export default function ChallengesLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton actions={1} />
      <TabsSkeleton count={3} />
      <CardGridSkeleton count={6} columns={3} bodyClassName="h-24" />
    </PageSkeleton>
  );
}
