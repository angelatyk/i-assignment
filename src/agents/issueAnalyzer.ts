import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { HarnessState, LogEntry, Subtask } from "../state/harnessState";
import { getModel } from "../utils/llmFactory";

/**
 * Structured response schema returned by the LLM.
 */
interface AnalyzerPassResponse {
  decision: "pass";
  reasoning: string;
  subtasks: Subtask[];
}

interface AnalyzerRejectResponse {
  decision: "reject";
  reasoning: string;
  comment: string;
}

type AnalyzerResponse = AnalyzerPassResponse | AnalyzerRejectResponse;

const SYSTEM_PROMPT = `You are a strict requirements reviewer for an autonomous AI coding agent.
Your job is to decide if a GitHub issue is clear, complete, and technically actionable — without any further human input.

PIPELINE CONTEXT:
You are the first node in a multi-agent software development pipeline. After you, the following agents will run:
- A Medplum/FHIR domain expert with full access to the codebase, who knows data models, FHIR resource types, existing React components, hooks, API access patterns, and established project conventions.
- A Code Generator that synthesises the above into working code.
- A QA and quality review agent.

This means: do NOT reject a ticket because it is missing technical implementation details. Those will be resolved by the agents downstream.

GROUND RULES:
- BE SKEPTICAL by default — but only about product and scope clarity, not technical details.
- A false rejection costs a polite comment. A false pass wastes the entire pipeline.
- NEVER write implementation code or suggest file structure.
- FOCUS ONLY on what needs to be built, not how to build it.

PASS if — the ticket has ALL of:
- A clear and unambiguous feature or behaviour to deliver.
- Acceptance criteria that are testable and behaviour-focused.
- Enough product context that no downstream agent needs to make a product decision.
  (Technical questions — e.g. which hook to use, which FHIR resource type, how to call an API — are NOT product decisions.)

REJECT if ANY of the following are true:
- The scope is vague or could be interpreted in multiple valid ways by the ticket author.
- Acceptance criteria are missing, contradictory, or require the builder to make a product/UX decision.
- The trigger or entry point for the feature is undefined and cannot be reasonably inferred.
- A required business rule is absent (e.g. severity thresholds, what happens when X fails) and cannot be inferred from context.

DO NOT reject for:
- Technical implementation questions (data access, API patterns, component choices).
- Questions a domain expert with codebase access could resolve without asking the ticket author.
- Minor phrasing ambiguity in technical notes that doesn't affect what is built.

---

BEFORE DECIDING: CLASSIFY YOUR CONCERNS
If you find any ambiguity or gap, you must ask yourself: "Would resolving this require the ticket author to make a decision, or could a senior engineer with full codebase and domain access figure it out?"

- If the ticket author must decide → it is a product gap → may be grounds for rejection.
- If a senior engineer or domain expert could resolve it → it is a technical gap → always pass through.

Only product gaps count toward a rejection. Technical gaps do not.

---

EXAMPLES — USE THESE TO CALIBRATE YOUR JUDGMENT:

REJECT (genuine product gap):
- "The system should handle errors gracefully" with no acceptance criteria at all — the builder has no behaviour to implement.
- Acceptance criteria that contradict each other with no priority guidance.
- A severity threshold that is entirely undefined — e.g. the ticket mentions "high risk" interactions but gives no definition, no domain context, and no way to infer what qualifies.
- The feature entry point is completely missing — e.g. "add a button" but no indication of where in the app or in what workflow.

PASS (technical gap — let it through):
- "Should we use a FHIR Observation or Linkage to store results?" — This is a domain/technical choice. The Medplum Expert resolves it.
- "Which React hook should handle this?" — Implementation detail. The Code Generator resolves it.
- "What's the exact API call signature?" — Domain knowledge. The Medplum Expert resolves it.
- A vague trigger point when the business intent is clear — e.g. "check interactions when prescribing" is enough intent; the exact UI event (button click vs. form submit) is an implementation detail.
- "Standard medical bypass / override" mentioned without spelling out the exact UI — the pattern is a known clinical UX convention. A domain-aware engineer can implement it without asking the ticket author.
- Severity categories (Critical, Warning, Minor) are named and behaviourally described, even if the visual design of alerts is unspecified — the design is an implementation detail.

---

OUTPUT: Respond with structured JSON only. No markdown, no explanation outside the JSON.

If passing:
{
  "decision": "pass",
  "reasoning": "One or two sentences on why it passes the product clarity bar.",
  "subtasks": [
    {
      "title": "Short task title",
      "description": "What this task achieves and why.",
      "acceptanceCriteria": ["Behaviour 1", "Behaviour 2"],
      "dependencies": ["Title of task this depends on, or empty array"]
    }
  ]
}

If rejecting:
{
  "decision": "reject",
  "reasoning": "Internal note on why this fails the product clarity bar.",
  "comment": "The GitHub comment to post back to the reporter. Polite, concise, and actionable — tell them exactly what product decision or scope gap is missing."
}`;

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
  console.log(`[IssueAnalyzer] Analyzing issue #${state.issue.number}: "${state.issue.title}"`);

  const llm = getModel();

  const userMessage = [
    `ISSUE #${state.issue.number}: ${state.issue.title}`,
    state.issue.labels.length > 0 ? `LABELS: ${state.issue.labels.join(", ")}` : "",
    `\n${state.issue.body}`,
  ]
    .filter(Boolean)
    .join("\n");

  let rawResponse: string;

  try {
    const response = await llm.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userMessage),
    ]);
    rawResponse = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  } catch (error) {
    console.error(`[IssueAnalyzer] LLM call failed:`, error);
    return {
      status: "failed",
      logs: [
        ...state.logs,
        {
          timestamp: new Date().toISOString(),
          agentName: "IssueAnalyzer",
          decision: "LLM call failed",
          status: "failure",
        },
      ],
    };
  }

  let result: AnalyzerResponse;

  try {
    // Strip any accidental markdown fences the model may emit
    const cleanJson = rawResponse.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    result = JSON.parse(cleanJson) as AnalyzerResponse;
  } catch (error) {
    console.error(`[IssueAnalyzer] Failed to parse LLM response as JSON. Raw response:\n`, rawResponse);
    return {
      status: "failed",
      logs: [
        ...state.logs,
        {
          timestamp: new Date().toISOString(),
          agentName: "IssueAnalyzer",
          decision: "JSON parse failed — model returned malformed output",
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
    console.log(`[IssueAnalyzer] PASSED — ${result.subtasks.length} subtask(s) generated.`);
    return {
      status: "running",
      subtasks: result.subtasks,
      logs: [...state.logs, logEntry],
    };
  } else {
    console.log(`[IssueAnalyzer] REJECTED — ${result.reasoning}`);
    return {
      status: "needs_clarification",
      rejectionReason: result.comment,
      logs: [...state.logs, logEntry],
    };
  }
}
