export {};

type Data = Record<string, unknown>;
type MockRef = {
  id: string;
  path: string;
  get: jest.Mock;
  set: jest.Mock;
};

const documents = new Map<string, Data>();
const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();

function makeRef(collection: string, id: string): MockRef {
  const path = `${collection}/${id}`;
  const ref: MockRef = {
    id,
    path,
    get: jest.fn(async () => ({
      id,
      ref,
      exists: documents.has(path),
      data: () => documents.get(path),
    })),
    set: jest.fn(async (data: Data, options?: { merge?: boolean }) => {
      documents.set(path, {
        ...(options?.merge ? documents.get(path) : {}),
        ...data,
      });
    }),
  };
  return ref;
}

const mockCollection = jest.fn((collection: string) => ({
  doc: (id: string) => makeRef(collection, id),
  where: (field: string, operator: string, value: unknown) => ({
    limit: (limit: number) => ({
      get: jest.fn(async () => ({
        docs: Array.from(documents.entries())
          .filter(
            ([path, data]) =>
              path.startsWith(`${collection}/`) &&
              operator === "==" &&
              data[field] === value,
          )
          .slice(0, limit)
          .map(([path, data]) => {
            const id = path.slice(collection.length + 1);
            return { id, ref: makeRef(collection, id), data: () => data };
          }),
      })),
    }),
  }),
}));

const mockBatch = jest.fn(() => {
  const writes: Array<{
    ref: MockRef;
    data: Data;
    options?: { merge?: boolean };
  }> = [];
  return {
    set: jest.fn(
      (ref: MockRef, data: Data, options?: { merge?: boolean }) => {
        writes.push({ ref, data, options });
      },
    ),
    commit: jest.fn(async () => {
      for (const write of writes) {
        await write.ref.set(write.data, write.options);
      }
    }),
  };
});

jest.mock("../config/firebase.js", () => ({
  adminAuthFor: jest.fn(() => ({
    getUser: mockGetUser,
    updateUser: mockUpdateUser,
  })),
  adminDbFor: jest.fn(() => ({
    collection: mockCollection,
    batch: mockBatch,
  })),
}));

jest.mock("../config/env.js", () => ({
  TEAM_ALLOWLIST: new Set(),
  resolveProjectAccess: jest.fn(() => []),
}));

describe("profile setup role linkage", () => {
  beforeEach(() => {
    jest.resetModules();
    documents.clear();
    mockCollection.mockClear();
    mockBatch.mockClear();
    mockGetUser.mockReset();
    mockUpdateUser.mockReset();
    mockGetUser.mockResolvedValue({
      uid: "member-uid",
      email: "member@example.com",
      displayName: "Member",
    });
    mockUpdateUser.mockResolvedValue({});
    documents.set("user_roles/member@example.com", {
      email: "member@example.com",
      role: "full_admin",
      isActive: true,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("links the role to the community account created by complete profile", async () => {
    const { completeProfileSetup } =
      await import("../repositories/profile-setup.repository");

    await completeProfileSetup("member-uid", "full_admin", {
      fullName: "Member Example",
      iconName: "person.crop.circle.fill",
      iconColorHex: "#5A4FCF",
    });

    const communityUser = documents.get("community_users/member-uid");
    const role = documents.get("user_roles/member@example.com");
    expect(communityUser).toMatchObject({
      email: "member@example.com",
      username: expect.any(String),
    });
    expect(role).toMatchObject({
      firebaseUid: "member-uid",
      communityUserId: "member-uid",
      communityUserOriginalEmail: "member@example.com",
      communityUserOriginalUsername: communityUser?.username,
    });
  });
});
