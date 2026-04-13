import { describe, it, expect } from "vitest";
import { END } from "@langchain/langgraph";
import { routeAfterIssueAnalyzer } from "./edges";
import { HarnessState } from "../state/harnessState";

describe("routeAfterIssueAnalyzer", () => {
  it("routes to END when status is needs_clarification", () => {
    const state = { status: "needs_clarification" } as unknown as HarnessState;
    expect(routeAfterIssueAnalyzer(state)).toBe(END);
  });

  it("routes to END when status is failed", () => {
    const state = { status: "failed" } as unknown as HarnessState;
    expect(routeAfterIssueAnalyzer(state)).toBe(END);
  });

  it("routes to medplumExpert when status is running", () => {
    const state = { status: "running" } as unknown as HarnessState;
    expect(routeAfterIssueAnalyzer(state)).toBe("medplumExpert");
  });

  it("routes to medplumExpert when status is done", () => {
    // Though usually it would be 'running' out of analyzer, 
    // any status other than needs_clarification or failed routes to medplumExpert.
    const state = { status: "done" } as unknown as HarnessState;
    expect(routeAfterIssueAnalyzer(state)).toBe("medplumExpert");
  });
});
