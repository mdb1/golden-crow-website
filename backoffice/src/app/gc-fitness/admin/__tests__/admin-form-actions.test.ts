// __tests__/admin-form-actions.test.ts
//
// The admin console's FormData → Server Action wrappers (#382 moved them out of
// the pages so their action IDs stay stable). They are thin, but the mapping is
// load-bearing: which form field lands in which argument decides WHICH account
// a destructive action hits, and the hard-coded literals ("execute",
// keepTrainer) decide how dangerous the click is. Pinned per wrapper:
//   - field → argument mapping (incl. defaults for missing fields);
//   - revalidatePath + redirect targets;
//   - a rejected lib call propagates and skips revalidate/redirect.
// The admin gate + ownership checks live in the lib actions (tested in
// src/lib/gc-fitness/__tests__/admin-actions.guards.test.ts and
// admin-coachless-actions.test.ts); here they are mocked.

const mockRevalidatePath = jest.fn();
jest.mock("next/cache", () => ({ revalidatePath: (p: string) => mockRevalidatePath(p) }));
const mockRedirect = jest.fn();
jest.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }));

const mockLib = {
  addCoachEmailToAllowlist: jest.fn(async (_i: unknown) => ({ ok: true })),
  promoteUserToAdmin: jest.fn(async (_i: unknown) => ({ ok: true })),
  removeCoachEmailFromAllowlist: jest.fn(async (_i: unknown) => ({ ok: true })),
  deleteCoachCascade: jest.fn(async (_i: unknown) => ({ ok: true })),
  deactivateClientForCoach: jest.fn(async (_i: unknown) => ({ ok: true })),
  deleteClientCascade: jest.fn(async (_i: unknown) => ({ ok: true })),
  removePendingClientForCoach: jest.fn(async (_i: unknown) => ({ ok: true })),
  transferClientToCoach: jest.fn(async (_i: unknown) => ({ ok: true })),
  unlinkClientFromCoach: jest.fn(async (_i: unknown) => ({ ok: true })),
  deleteCoachlessUser: jest.fn(async (_i: unknown) => ({ ok: true })),
  setUserEntitlementTier: jest.fn(async (_i: unknown) => ({ ok: true })),
};
jest.mock("@/lib/gc-fitness/admin-actions", () => ({
  addCoachEmailToAllowlist: (i: unknown) => mockLib.addCoachEmailToAllowlist(i),
  promoteUserToAdmin: (i: unknown) => mockLib.promoteUserToAdmin(i),
  removeCoachEmailFromAllowlist: (i: unknown) => mockLib.removeCoachEmailFromAllowlist(i),
  deleteCoachCascade: (i: unknown) => mockLib.deleteCoachCascade(i),
  deactivateClientForCoach: (i: unknown) => mockLib.deactivateClientForCoach(i),
  deleteClientCascade: (i: unknown) => mockLib.deleteClientCascade(i),
  removePendingClientForCoach: (i: unknown) => mockLib.removePendingClientForCoach(i),
  transferClientToCoach: (i: unknown) => mockLib.transferClientToCoach(i),
  unlinkClientFromCoach: (i: unknown) => mockLib.unlinkClientFromCoach(i),
}));
jest.mock("@/lib/gc-fitness/admin-coachless-actions", () => ({
  deleteCoachlessUser: (i: unknown) => mockLib.deleteCoachlessUser(i),
  setUserEntitlementTier: (i: unknown) => mockLib.setUserEntitlementTier(i),
}));

import * as consoleActions from "@/app/gc-fitness/admin/actions";
import * as coachActions from "@/app/gc-fitness/admin/coaches/[uid]/actions";
import * as listActions from "@/app/gc-fitness/admin/coach-less-users/actions";
import * as profileActions from "@/app/gc-fitness/admin/coach-less-users/[uid]/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  jest.clearAllMocks();
});

function expectNav(paths: string[], redirectTo: string | null) {
  expect(mockRevalidatePath.mock.calls.map((c) => c[0])).toEqual(paths);
  if (redirectTo === null) expect(mockRedirect).not.toHaveBeenCalled();
  else expect(mockRedirect).toHaveBeenCalledWith(redirectTo);
}

describe("admin/actions.ts (console)", () => {
  it("addAllowlistEmailAction passes the raw email string", async () => {
    await consoleActions.addAllowlistEmailAction(form({ email: "a@b.com" }));
    expect(mockLib.addCoachEmailToAllowlist).toHaveBeenCalledWith("a@b.com");
    expectNav(["/gc-fitness/admin"], "/gc-fitness/admin?op=allowlist_add&ok=1");
  });

  it("addAllowlistEmailAction sends '' when the field is missing", async () => {
    await consoleActions.addAllowlistEmailAction(form({}));
    expect(mockLib.addCoachEmailToAllowlist).toHaveBeenCalledWith("");
  });

  it("promoteToAdminAction always keeps the trainer role", async () => {
    await consoleActions.promoteToAdminAction(form({ email: "c@d.com", keepTrainer: "false" }));
    expect(mockLib.promoteUserToAdmin).toHaveBeenCalledWith({ email: "c@d.com", keepTrainer: true });
    expectNav(["/gc-fitness/admin"], "/gc-fitness/admin?op=promote_admin&ok=1");
  });

  it("removeAllowlistEmailAction wraps the email in an object", async () => {
    await consoleActions.removeAllowlistEmailAction(form({ email: "e@f.com" }));
    expect(mockLib.removeCoachEmailFromAllowlist).toHaveBeenCalledWith({ email: "e@f.com" });
    expectNav(["/gc-fitness/admin"], "/gc-fitness/admin?op=allowlist_remove&ok=1");
  });

  it("deleteCoachAction forwards uid/confirmation/mode and defaults mode to dry_run", async () => {
    await consoleActions.deleteCoachAction(form({ coachUid: "coach-A1", confirmation: "DELETE COACH" }));
    expect(mockLib.deleteCoachCascade).toHaveBeenCalledWith({
      coachUid: "coach-A1",
      confirmation: "DELETE COACH",
      mode: "dry_run",
    });
    expectNav(["/gc-fitness/admin"], "/gc-fitness/admin?op=delete_coach&ok=1");

    await consoleActions.deleteCoachAction(
      form({ coachUid: "coach-A1", confirmation: "DELETE COACH", mode: "execute" }),
    );
    expect(mockLib.deleteCoachCascade).toHaveBeenLastCalledWith({
      coachUid: "coach-A1",
      confirmation: "DELETE COACH",
      mode: "execute",
    });
  });

  it("a rejected lib call (e.g. Forbidden) propagates and skips revalidate + redirect", async () => {
    mockLib.deleteCoachCascade.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(
      consoleActions.deleteCoachAction(form({ coachUid: "coach-A1", confirmation: "x", mode: "execute" })),
    ).rejects.toThrow("Forbidden");
    expectNav([], null);
  });
});

describe("admin/coaches/[uid]/actions.ts", () => {
  it("deactivateClientAction passes coachUid + clientUid (ownership is checked in the lib), no redirect", async () => {
    await coachActions.deactivateClientAction(form({ coachUid: "coach-A1", clientUid: "client-A1" }));
    expect(mockLib.deactivateClientForCoach).toHaveBeenCalledWith({
      coachUid: "coach-A1",
      clientUid: "client-A1",
    });
    expectNav(["/gc-fitness/admin/coaches/coach-A1"], null);
  });

  it("transferClientAction sends clientUid + newCoachUid and returns to the ORIGIN coach page", async () => {
    await coachActions.transferClientAction(
      form({ coachUid: "coach-A1", clientUid: "client-A1", newCoachUid: "coach-B1" }),
    );
    expect(mockLib.transferClientToCoach).toHaveBeenCalledWith({
      clientUid: "client-A1",
      newCoachUid: "coach-B1",
    });
    expectNav(
      ["/gc-fitness/admin/coaches/coach-A1"],
      "/gc-fitness/admin/coaches/coach-A1?op=transfer_client&ok=1",
    );
  });

  it("unlinkClientAction passes coachUid + clientUid and revalidates the coach-less list too", async () => {
    await coachActions.unlinkClientAction(form({ coachUid: "coach-A1", clientUid: "client-A1" }));
    expect(mockLib.unlinkClientFromCoach).toHaveBeenCalledWith({
      coachUid: "coach-A1",
      clientUid: "client-A1",
    });
    expectNav(
      ["/gc-fitness/admin/coaches/coach-A1", "/gc-fitness/admin/coach-less-users"],
      "/gc-fitness/admin/coaches/coach-A1?op=unlink_client&ok=1",
    );
  });

  it("removePendingAction passes coachUid + email, no redirect", async () => {
    await coachActions.removePendingAction(form({ coachUid: "coach-A1", email: "p@x.com" }));
    expect(mockLib.removePendingClientForCoach).toHaveBeenCalledWith({
      coachUid: "coach-A1",
      email: "p@x.com",
    });
    expectNav(["/gc-fitness/admin/coaches/coach-A1"], null);
  });

  it("deleteClientAction hard-codes mode=execute and does NOT forward coachUid to the cascade", async () => {
    await coachActions.deleteClientAction(
      form({ coachUid: "coach-A1", clientUid: "client-A1", confirmation: "DELETE CLIENT", mode: "dry_run" }),
    );
    expect(mockLib.deleteClientCascade).toHaveBeenCalledWith({
      clientUid: "client-A1",
      confirmation: "DELETE CLIENT",
      mode: "execute",
    });
    expectNav(
      ["/gc-fitness/admin/coaches/coach-A1"],
      "/gc-fitness/admin/coaches/coach-A1?op=delete_client&ok=1",
    );
  });

  it("an ownership refusal from the lib propagates with no revalidate/redirect", async () => {
    mockLib.unlinkClientFromCoach.mockRejectedValueOnce(new Error("Client is not linked to this coach."));
    await expect(
      coachActions.unlinkClientAction(form({ coachUid: "coach-A1", clientUid: "client-B1" })),
    ).rejects.toThrow("Client is not linked to this coach.");
    expectNav([], null);
  });
});

describe("admin/coach-less-users/actions.ts (list)", () => {
  const ROUTE = "/gc-fitness/admin/coach-less-users";

  it("assignCoachAction maps uid → clientUid and revalidates list + destination coach", async () => {
    await listActions.assignCoachAction(form({ uid: "solo-user1", newCoachUid: "coach-B1" }));
    expect(mockLib.transferClientToCoach).toHaveBeenCalledWith({
      clientUid: "solo-user1",
      newCoachUid: "coach-B1",
    });
    expectNav([ROUTE, "/gc-fitness/admin/coaches/coach-B1"], `${ROUTE}?op=assign_coach&ok=1`);
  });

  it("setTierAction passes uid + tier and echoes the tier in the redirect", async () => {
    await listActions.setTierAction(form({ uid: "solo-user1", tier: "premium" }));
    expect(mockLib.setUserEntitlementTier).toHaveBeenCalledWith({ uid: "solo-user1", tier: "premium" });
    expectNav([ROUTE], `${ROUTE}?op=set_premium&ok=1`);
  });

  it("deleteUserAction forwards the typed email confirmation", async () => {
    await listActions.deleteUserAction(form({ uid: "solo-user1", emailConfirmation: "s@x.com" }));
    expect(mockLib.deleteCoachlessUser).toHaveBeenCalledWith({
      uid: "solo-user1",
      emailConfirmation: "s@x.com",
    });
    expectNav([ROUTE], `${ROUTE}?op=delete_user&ok=1`);
  });

  it("a refused delete (email mismatch) propagates with no redirect", async () => {
    mockLib.deleteCoachlessUser.mockRejectedValueOnce(new Error("Email confirmation does not match the target user."));
    await expect(
      listActions.deleteUserAction(form({ uid: "solo-user1", emailConfirmation: "nope" })),
    ).rejects.toThrow("Email confirmation does not match");
    expectNav([], null);
  });

  it("missing fields become empty strings (the lib's zod rejects them)", async () => {
    await listActions.setTierAction(form({}));
    expect(mockLib.setUserEntitlementTier).toHaveBeenCalledWith({ uid: "", tier: "" });
  });
});

describe("admin/coach-less-users/[uid]/actions.ts (profile)", () => {
  const LIST = "/gc-fitness/admin/coach-less-users";

  it("assignCoachAction lands on the client's NEW coached drill-down", async () => {
    await profileActions.assignCoachAction(form({ uid: "solo-user1", newCoachUid: "coach-B1" }));
    expect(mockLib.transferClientToCoach).toHaveBeenCalledWith({
      clientUid: "solo-user1",
      newCoachUid: "coach-B1",
    });
    expectNav(
      [LIST, "/gc-fitness/admin/coaches/coach-B1"],
      "/gc-fitness/admin/coaches/coach-B1/clients/solo-user1",
    );
  });

  it("setTierAction revalidates and returns to the profile", async () => {
    await profileActions.setTierAction(form({ uid: "solo-user1", tier: "free" }));
    expect(mockLib.setUserEntitlementTier).toHaveBeenCalledWith({ uid: "solo-user1", tier: "free" });
    expectNav([`${LIST}/solo-user1`], `${LIST}/solo-user1?op=set_free&ok=1`);
  });

  it("deleteUserAction lands back on the list, not the (now 404) profile", async () => {
    await profileActions.deleteUserAction(form({ uid: "solo-user1", emailConfirmation: "s@x.com" }));
    expect(mockLib.deleteCoachlessUser).toHaveBeenCalledWith({
      uid: "solo-user1",
      emailConfirmation: "s@x.com",
    });
    expectNav([LIST], `${LIST}?op=delete_user&ok=1`);
  });

  it("a Forbidden lib call propagates with no revalidate/redirect", async () => {
    mockLib.setUserEntitlementTier.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(profileActions.setTierAction(form({ uid: "solo-user1", tier: "free" }))).rejects.toThrow(
      "Forbidden",
    );
    expectNav([], null);
  });
});
