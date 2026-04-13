// Graph: Main graph assembly and compilation
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { 
  GitHubIssue, 
  Subtask, 
  PipelineStatus, 
  MedplumContextDocument, 
  LogEntry, 
  HarnessState 
} from "../state/harnessState";
import { issueAnalyzer } from "../agents/issueAnalyzer/issueAnalyzer";
import { medplumExpert } from "../agents/medplumExpert/medplumExpert";

/**
 * HarnessGraphAnnotation defines the state channels for LangGraph.
 * We use the default reducer (overwrite) for everything,
 * because our nodes return newly spread arrays rather than pushing elements.
 */
export const HarnessGraphAnnotation = Annotation.Root({
  issue: Annotation<GitHubIssue>,
  subtasks: Annotation<Subtask[]>,
  status: Annotation<PipelineStatus>,
  rejectionReason: Annotation<string>,
  medplumContext: Annotation<MedplumContextDocument>,
  logs: Annotation<LogEntry[]>,
});

// Configure the state graph
const builder = new StateGraph(HarnessGraphAnnotation)
  // Register Nodes
  .addNode("issueAnalyzer", issueAnalyzer)
  .addNode("medplumExpert", medplumExpert)

  // Register Entry Edge
  .addEdge(START, "issueAnalyzer")

  // Conditional logic for routing after first analyzer
  .addConditionalEdges("issueAnalyzer", (state: HarnessState) => {
    // If rejected or failed, end the graph execution
    if (state.status === "needs_clarification" || state.status === "failed") {
      return END;
    }
    // Otherwise, move to the medplum expert
    return "medplumExpert";
  })

  // medplumExpert is the final node before finishing the pipeline
  .addEdge("medplumExpert", END);

// Compile the executable graph
export const harnessGraph = builder.compile();
