import { describe, it, expect } from "vitest";
import { lineTotals } from "./format";
describe("invoice line totals", () => {
  it("applies 14% IVA", () => {
    expect(lineTotals(2, 1000, 14)).toEqual({ subtotal: 2000, tax: 280, total: 2280 });
  });
});
