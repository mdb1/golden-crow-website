// __tests__/nextauth.route.test.ts — /api/auth/[...nextauth].
//
// The route is a thin wrapper: one NextAuth handler built from the shared
// `authOptions`, exported as both GET and POST. Pins that it is wired to the
// real options object (not a copy) and that no other method is exported.

// The route calls NextAuth() at import time, so the mocks live inside the
// (hoisted) factory and are read back with jest.requireMock.
jest.mock("next-auth", () => {
  const handler = jest.fn();
  return { __esModule: true, handler, default: jest.fn(() => handler) };
});
jest.mock("@/lib/auth", () => ({ authOptions: { marker: "authOptions" } }));

import * as route from "@/app/api/auth/[...nextauth]/route";
import { authOptions } from "@/lib/auth";

const { default: mockNextAuth, handler: mockHandler } = jest.requireMock("next-auth") as {
  default: jest.Mock;
  handler: jest.Mock;
};

it("builds ONE NextAuth handler from the shared authOptions and exports it as GET + POST only", () => {
  expect(mockNextAuth).toHaveBeenCalledTimes(1);
  expect(mockNextAuth.mock.calls[0][0]).toBe(authOptions);
  expect(route.GET).toBe(mockHandler);
  expect(route.POST).toBe(mockHandler);
  expect(Object.keys(route).sort()).toEqual(["GET", "POST"]);
});
