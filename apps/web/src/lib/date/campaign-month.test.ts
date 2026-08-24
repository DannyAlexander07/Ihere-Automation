import { describe, expect, it } from "vitest";
import { formatCampaignMonth } from "./campaign-month";

describe("formatCampaignMonth", () => {
  it("no retrocede al mes anterior por la zona horaria de Lima", () => {
    expect(formatCampaignMonth(2026, 8)).toBe("Agosto de 2026");
    expect(formatCampaignMonth(2026, 8, false)).toBe("Agosto");
  });
});
