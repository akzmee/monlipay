import { expect, it } from "vitest";
import { parsePrivateAmount } from "./private-payment";
it.each(["1.0000001", "0.9999999", "0.0000001"])(
  "rejects excess six-decimal precision instead of rounding %s",
  (value) => {
    expect(() => parsePrivateAmount(value, 6)).toThrow(
      "at most 6 decimal places",
    );
  },
);
it.each(["-1", "1e6", "0", "1,25"])(
  "rejects invalid or zero private amount %s",
  (value) => {
    expect(() => parsePrivateAmount(value, 6)).toThrow();
  },
);
it("preserves exact units for USDC and WMON including fractional input", () => {
  expect(parsePrivateAmount("12.34", 6)).toBe(12340000n);
  expect(parsePrivateAmount(".5", 18)).toBe(500000000000000000n);
});
