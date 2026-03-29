import { adminDb, adminAuth } from "../config/firebase.js";

export interface DashboardStats {
  accounts: {
    authUsers: number;
    authUsersExact: boolean;
    profiles: number;
    publicProfiles: number;
    communityUsers: number;
  };
  reports: {
    reportCodes: number;
    uploadedReports: number;
    reportOwners: number;
  };
  community: {
    posts: number;
    comments: number;
    events: number;
  };
  learning: {
    progressRecords: number;
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    authResult,
    profilesSnap,
    publicProfilesSnap,
    communityUsersSnap,
    reportCodesSnap,
    uploadedReportsSnap,
    reportOwnersSnap,
    postsSnap,
    commentsSnap,
    eventsSnap,
    userProgressSnap,
  ] = await Promise.all([
    adminAuth.listUsers(1000),
    adminDb.collection("profiles").count().get(),
    adminDb.collection("public_profiles").count().get(),
    adminDb.collection("community_users").count().get(),
    adminDb.collection("report_codes").count().get(),
    adminDb.collection("uploaded_reports").count().get(),
    adminDb.collection("report_owners").count().get(),
    adminDb.collection("community_posts").count().get(),
    adminDb.collectionGroup("comments").count().get(),
    adminDb.collectionGroup("events").count().get(),
    adminDb.collection("user_progress").count().get(),
  ]);

  const authUsersExact = !authResult.pageToken;
  const authUsers = authResult.users.length;

  return {
    accounts: {
      authUsers,
      authUsersExact,
      profiles: profilesSnap.data().count,
      publicProfiles: publicProfilesSnap.data().count,
      communityUsers: communityUsersSnap.data().count,
    },
    reports: {
      reportCodes: reportCodesSnap.data().count,
      uploadedReports: uploadedReportsSnap.data().count,
      reportOwners: reportOwnersSnap.data().count,
    },
    community: {
      posts: postsSnap.data().count,
      comments: commentsSnap.data().count,
      events: eventsSnap.data().count,
    },
    learning: {
      progressRecords: userProgressSnap.data().count,
    },
  };
}
