import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { HarnessState, LogEntry, Subtask } from "../state/harnessState";
import { getModel } from "../utils/llmFactory";
import { ISSUE_ANALYZER_SYSTEM_PROMPT } from "../prompts/issueAnalyzerPrompt";

/**
 * Structured response schema using Zod for the LLM.
 */
const AnalyzerResponseSchema = z.object({
  decision: z.enum(["pass", "reject"]).describe("Whether the ticket passed or was rejected due to product gaps."),
  reasoning: z.string().describe("Internal note on why this passes or fails the product clarity bar."),
  subtasks: z.array(
    z.object({
      title: z.string().describe("Short task title"),
      description: z.string().describe("What this task achieves and why."),
      acceptanceCriteria: z.array(z.string()).describe("List of testable behaviours"),
      dependencies: z.array(z.string()).describe("List of subtask titles this task depends on, or empty array if none"),
    })
  ).optional().describe("Provide subtasks ONLY if the decision is 'pass'."),
  comment: z.string().optional().describe("The GitHub comment to post to the reporter. Provide ONLY if the decision is 'reject'."),
});

type AnalyzerResponse = z.infer<typeof AnalyzerResponseSchema>;

/**
 * issueAnalyzer is a LangGraph node that performs strict requirements review.
 * It decides if an issue is implementation-ready (pass) or needs clarification (reject).
 *
 * On pass:  returns an ordered subtask list and keeps status "running".
 * On reject: returns a rejection comment for the GitHub issue and sets status to "needs_clarification".
 *
 * @param state - The current HarnessState
 * @returns Partial state update with the analysis outcome
 */
export async function issueAnalyzer(state: HarnessState): Promise<Partial<HarnessState>> {
  const safeTitle = state.issue.title || "No title provided";
  const safeBody = state.issue.body || "No description provided.";
  
  console.log(`[IssueAnalyzer] Analyzing issue #${state.issue.number}: "${safeTitle}"`);

  const llm = getModel();
  const structuredLlm = llm.withStructuredOutput(AnalyzerResponseSchema);

  const userMessage = [
    `ISSUE #${state.issue.number}: ${safeTitle}`,
    state.issue.labels.length > 0 ? `LABELS: ${state.issue.labels.join(", ")}` : "",
    `\n${safeBody}`,
  ]
    .filter(Boolean)
    .join("\n");

  let result: AnalyzerResponse;

  try {
    result = await structuredLlm.invoke([
      new SystemMessage(ISSUE_ANALYZER_SYSTEM_PROMPT),
      new HumanMessage(userMessage),
    ]) as AnalyzerResponse;
  } catch (error) {
    console.error(`[IssueAnalyzer] LLM call or JSON parsing failed:`, error);
    return {
      status: "failed",
      logs: [
        ...state.logs,
        {
          timestamp: new Date().toISOString(),
          agentName: "IssueAnalyzer",
          decision: "Structured LLM call failed or produced malformed schema",
          status: "failure",
        },
      ],
    };
  }

  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    agentName: "IssueAnalyzer",
    decision: result.decision === "pass"
      ? `Passed: ${result.reasoning}`
      : `Rejected: ${result.reasoning}`,
    status: "success",
  };

  if (result.decision === "pass") {
    console.log(`[IssueAnalyzer] PASSED — ${(result.subtasks || []).length} subtask(s) generated.`);
    // Mapping our zod subtasks specifically to HarnessState subtasks interface explicitly
    const parsedSubtasks: Subtask[] = (result.subtasks || []).map((task) => ({
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      dependencies: task.dependencies
    }));

    return {
      status: "running",
      subtasks: parsedSubtasks,
      logs: [...state.logs, logEntry],
    };
  } else {
    console.log(`[IssueAnalyzer] REJECTED — ${result.reasoning}`);
    return {
      status: "needs_clarification",
      rejectionReason: result.comment || "Rejection reason unspecified.",
      logs: [...state.logs, logEntry],
    };
  }
}
