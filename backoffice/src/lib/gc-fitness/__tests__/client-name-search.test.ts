import { filterClientsByQuery } from "../client-name-search";

const clients = [
  { uid: "1", displayName: "José Pérez", email: "jose@x.com" },
  { uid: "2", displayName: "Ana", email: "ana.lopez@x.com" },
  { uid: "3", displayName: "Bruno" },
];

describe("filterClientsByQuery (#485 calendar chip search)", () => {
  it("empty / blank query returns everyone", () => {
    expect(filterClientsByQuery(clients, "").map((c) => c.uid)).toEqual(["1", "2", "3"]);
    expect(filterClientsByQuery(clients, "   ").map((c) => c.uid)).toEqual(["1", "2", "3"]);
  });
  it("is case- and accent-insensitive", () => {
    expect(filterClientsByQuery(clients, "PEREZ").map((c) => c.uid)).toEqual(["1"]);
    expect(filterClientsByQuery(clients, "jose").map((c) => c.uid)).toEqual(["1"]);
  });
  it("matches the email too", () => {
    expect(filterClientsByQuery(clients, "lopez").map((c) => c.uid)).toEqual(["2"]);
  });
  it("no match → empty", () => {
    expect(filterClientsByQuery(clients, "zzz")).toEqual([]);
  });
});
