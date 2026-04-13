import { END } from "@langchain/langgraph";
import { HarnessState } from "../state/harnessState";

/**
 * Determines the next node in the graph after the Issue Analyzer completes.
 * - If the issue requires clarification or if the analyzer failed, end the execution.
 * - Otherwise, proceed to the Medplum Expert.
 *
 * @param state The current state of the harness.
 * @returns The name of the next node to execute or END.
 */
export function routeAfterIssueAnalyzer(state: HarnessState): string | typeof END {
  if (state.status === "needs_clarification" || state.status === "failed") {
    return END;
  }
  
  return "medplumExpert";
}
