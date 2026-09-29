export {};

const deletedPaths: string[] = [];
const mockDeleteUser = jest.fn();
const mockCollection = jest.fn((collectionName: string) => ({
  doc: (id: string) => ({
    delete: jest.fn(async () => {
      deletedPaths.push(`${collectionName}/${id}`);
    }),
  }),
  where: jest.fn(() => {
    throw new Error(`Account deletion must not query ${collectionName}.`);
  }),
}));

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({
    deleteUser: mockDeleteUser,
  })),
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
  })),
}));

jest.mock("../config/env.js", () => ({
  ENV: {
    FIREBASE_WEB_API_KEY: "",
    EMAIL_VERIFICATION_CONTINUE_URL: "",
  },
}));

describe("general user account deletion", () => {
  beforeEach(() => {
    jest.resetModules();
    deletedPaths.length = 0;
    mockDeleteUser.mockReset();
    mockCollection.mockClear();
  });

  it("deletes identity records without querying or deleting linked artifacts", async () => {
    const { deleteUserCascade } = await import(
      "../repositories/users.repository"
    );

    await expect(deleteUserCascade("user-uid")).resolves.toEqual({
      success: true,
      errors: [],
    });

    expect(mockDeleteUser).toHaveBeenCalledWith("user-uid");
    expect(deletedPaths.sort()).toEqual(
      [
        "community_users/user-uid",
        "object_owners/user-uid",
        "profiles/user-uid",
        "public_profiles/user-uid",
        "report_owners/user-uid",
        "user_progress/user-uid",
      ].sort(),
    );
    for (const preservedCollection of [
      "community_posts",
      "feed_items",
      "file_storage",
      "object_codes",
      "partnership_notes",
      "report_codes",
      "service_offers",
      "service_transactions",
      "uploaded_objects",
      "uploaded_reports",
    ]) {
      expect(mockCollection).not.toHaveBeenCalledWith(preservedCollection);
    }
  });
});
