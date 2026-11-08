import { derivePublisherAppCounterpointColors } from "../lib/publisher-app-color-identity.js";

// Fixed vectors are also the backoffice calculator's verified output. Keep the
// producer contract independent of sibling source files in SDK deployments.
const vectors = [
  ["#5A443C", ["#524935", "#59424A", "#494C38", "#544454"]],
  ["#D8C7C0", ["#D1CBBC", "#D8C6CB", "#C9CDBE", "#D3C6D2"]],
  ["#1D4ED8", ["#8425B9", "#006B82", "#A50086", "#006F6A"]],
  ["#66F246", ["#00EDDC", "#F2CC00", "#62E2FF", "#FFC081"]],
  ["#FF5500", ["#BF8E00", "#F54CA1", "#97A000", "#D55CE1"]],
  ["#808080", ["#808080", "#808080", "#808080", "#808080"]],
  ["#000000", ["#000000", "#000000", "#000000", "#000000"]],
  ["#FFFFFF", ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"]],
] as const;

describe("publisher-app counterpoint producer parity", () => {
  it.each(vectors)("matches the backoffice perceptual-tone vector for %s", (primary, expected) => {
    expect(Object.values(derivePublisherAppCounterpointColors(primary))).toEqual(expected);
  });

  it("normalizes the same supported primary spelling as the backoffice", () => {
    expect(derivePublisherAppCounterpointColors(" 5a443c ")).toEqual(derivePublisherAppCounterpointColors("#5A443C"));
    expect(derivePublisherAppCounterpointColors("invalid")).toEqual(derivePublisherAppCounterpointColors("#6D28D9"));
  });
});
