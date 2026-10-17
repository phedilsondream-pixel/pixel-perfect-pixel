import { describe, expect, it } from "vitest";
import { PLATFORMS, PLATFORM_STATUS_LABEL } from "./modules";

describe("Nexora platform catalogue", () => {
  it("contains exactly ten uniquely identified platforms", () => {
    expect(PLATFORMS).toHaveLength(10);
    expect(new Set(PLATFORMS.map((platform) => platform.id)).size).toBe(10);
  });

  it("uses a known status for every platform", () => {
    for (const platform of PLATFORMS) {
      expect(PLATFORM_STATUS_LABEL[platform.status]).toBeTruthy();
    }
  });

  it("does not present planned platforms as directly available", () => {
    for (const platform of PLATFORMS) {
      if (platform.status === "planned") {
        expect(platform.to).toBeUndefined();
      }
    }
  });

  it("only links existing first-phase areas for live or partial platforms", () => {
    expect(PLATFORMS.find((platform) => platform.id === "finance")?.to).toBe("/app/financas");
    expect(PLATFORMS.find((platform) => platform.id === "sales-cx")?.to).toBe("/app/vendas");
    expect(PLATFORMS.filter((platform) => platform.to).every((platform) => platform.status !== "planned")).toBe(true);
  });

  it("gives every platform a description and at least one included capability", () => {
    for (const platform of PLATFORMS) {
      expect(platform.description.trim().length).toBeGreaterThan(0);
      expect(platform.includes.length).toBeGreaterThan(0);
    }
  });
});
