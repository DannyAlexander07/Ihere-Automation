import { describe, expect, it } from "vitest";
import { initialTitleCandidates } from "./fixtures";
import { canApproveTitle, getTitleBlockingReasons } from "./rules";

describe("title approval rules", () => {
  it("blocks a high duplicate until a human resolves it", () => {
    const candidate = initialTitleCandidates.find((item) => item.id === "title-002");
    expect(candidate).toBeDefined();
    expect(canApproveTitle(candidate!)).toBe(false);
    expect(getTitleBlockingReasons(candidate!)).toContain("La duplicidad alta todavía no tiene una decisión humana registrada.");
  });

  it("allows a non-terminal title without critical blockers", () => {
    const candidate = initialTitleCandidates.find((item) => item.id === "title-001");
    expect(candidate).toBeDefined();
    expect(canApproveTitle(candidate!)).toBe(true);
    expect(getTitleBlockingReasons(candidate!)).toHaveLength(0);
  });

  it("does not approve a terminal title twice", () => {
    const candidate = initialTitleCandidates.find((item) => item.status === "approved");
    expect(candidate).toBeDefined();
    expect(canApproveTitle(candidate!)).toBe(false);
  });
});
