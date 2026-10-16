import { parseDecimalInput } from "../decimal-input";

describe("parseDecimalInput", () => {
  it.each([
    ["12,5", 12.5],
    ["12.5", 12.5],
    [" 22,5 ", 22.5],
    ["62,5", 62.5],
    ["1.234,5", 1234.5],
    ["1,234.5", 1234.5],
    ["1,234,567", 1234567],
    ["1.234.567,25", 1234567.25],
    ["2000", 2000],
    ["0", 0],
    ["-3,5", -3.5],
    ["1 234,5", 1234.5],
  ])("%s → %d", (raw, expected) => {
    expect(parseDecimalInput(raw)).toBe(expected);
  });

  it.each(["", "   ", "abc", "12,5kg", "1.2.3", "--1", "1,5,0", "1.23,4.5"])("%j → NaN", (raw) => {
    expect(parseDecimalInput(raw)).toBeNaN();
  });
});
