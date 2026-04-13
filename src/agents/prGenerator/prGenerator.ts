
/**
 * PATH: src/agents/prGenerator/prGenerator.ts
 * 
 * ============================================================================
 * PLANNED AGENT: PR Generator
 * ============================================================================
 * 
 * DESCRIPTION:
 * The final stage of the workflow. When the issue is successfully decomposed, coded,
 * and tested successfully, this agent aggregates the context from the `HarnessState` 
 * and opens a GitHub Pull Request natively describing what was built, assumptions made, 
 * and any constraints applied.
 * 
 * HIGH-LEVEL PSEUDOCODE:
 * 
 * export async function prGenerator(state: HarnessState): Promise<Partial<HarnessState>> {
 *    // 1. Summarize `state.issue`, `state.subtasks`, and all log decisions.
 *    // 2. Prompt LLM for a structured conventional Pull Request summary.
 *    // 3. Authenticate with GitHub Octokit SDK using repository env keys.
 *    // 4. Create branch, commit workspace changes, and open PR.
 *    // 5. Apply labels (e.g. "needs review", "ai-generated").
 *    
 *    return {
 *      status: 'done',
 *      logs: [...state.logs, { agentName: 'PRGenerator', status: 'success', decision: 'PR #123 Opened' }]
 *    };
 * }
 */
