import { describe, it, expect } from "vitest";
import { validateGroupInput } from "./group";
import { groupStatus } from "./link-history";

describe("Equal group payments", () => {
  it("keeps six-decimal amounts exact", () => {
    const total = validateGroupInput("100", 6, 10, [], "Participants", "open", "equal");
    expect(total / 10n).toBe(10000000n);
  });
  it("rejects indivisible pools and extra token decimals, while random pools need not divide evenly", () => {
    expect(() => validateGroupInput("100", 6, 3, [], "Team", "open", "equal")).toThrow(/split evenly/);
    expect(() => validateGroupInput("0.0000001", 6, 1, [], "Team", "open", "equal")).toThrow(/decimal/);
    expect(validateGroupInput("100", 6, 3, [], "Team", "open", "random")).toBe(100000000n);
  });
  it("keeps wallet eligibility and quota validation for both distributions", () => {
    for (const mode of ["equal", "random"] as const) {
      expect(() => validateGroupInput("100", 6, 10, [], "Team", "selected", mode)).toThrow(/eligible wallets/);
      expect(() => validateGroupInput("100", 6, 101, [], "Team", "open", mode)).toThrow(/100/);
    }
  });
  it("distinguishes completed equal payments from reserved random shares", () => {
    const p={closed:false,remaining:0n,expiry:200,requested:10,settled:10,slots:10};
    expect(groupStatus(p,100,true)).toBe("Completed");
    expect(groupStatus(p,300,true)).toBe("Completed");
    expect(groupStatus(p,100,false)).toBe("Fully allocated");
    expect(groupStatus({...p,requested:3,settled:3,remaining:70n},300,true)).toBe("Refund available");
  });
});
