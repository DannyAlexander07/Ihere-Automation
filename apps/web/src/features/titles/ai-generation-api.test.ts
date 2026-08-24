import { describe, expect, it } from "vitest";
import {
  generationFailureMessage,
  generationProgress,
  type ApiAiGenerationRun,
} from "./ai-generation-api";

function run(overrides: Partial<ApiAiGenerationRun> = {}): ApiAiGenerationRun {
  return {
    id: "run-1",
    status: "RUNNING",
    model: "gpt-5.6-terra",
    costMicros: 0,
    ...overrides,
  };
}

describe("AI generation presentation", () => {
  it("counts only completed specialist stages and caps visible progress", () => {
    expect(
      generationProgress(
        run({
          agentResults: [
            { sequence: 1, status: "COMPLETED" },
            { sequence: 2, status: "RUNNING" },
            { sequence: 3, status: "COMPLETED" },
            { sequence: 4, status: "COMPLETED" },
            { sequence: 5, status: "COMPLETED" },
          ],
        }),
      ),
    ).toEqual({ status: "RUNNING", completedStages: 3 });
  });

  it("returns a safe budget message instead of internal error details", () => {
    expect(
      generationFailureMessage(
        run({ status: "BUDGET_BLOCKED", errorMessage: "internal budget data" }),
      ),
    ).not.toContain("internal budget data");
  });
});
