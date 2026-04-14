/**
 * PATH: src/agents/qaAgent/qaAgent.ts
 *
 * ============================================================================
 * PLANNED AGENT: QA Agent
 * ============================================================================
 *
 * DESCRIPTION:
 * Runs in two phases:
 *
 * Phase 1 — deterministic: executes the pre-generated Vitest test suite from
 * the Test Case Generator against the generated code. No LLM involved.
 *
 * Phase 2 — adversarial: an LLM reviews the generated code and generates
 * additional test cases targeting edge cases, error boundaries, and unexpected
 * inputs not covered by the spec-derived tests. Uses a different model than
 * the Code Generator to avoid shared blind spots.
 *
 * Both phases must pass before the pipeline continues to the PR Generator.
 * One retry maximum across both phases, consistent with Code Quality Check.
 *
 * HIGH-LEVEL PSEUDOCODE:
 *
 * export async function qaAgent(state: HarnessState): Promise<Partial<HarnessState>> {
 *    // PHASE 1 — Run pre-generated test suite
 *    // 1. Read state.testCases and state.generatedCode
 *    // 2. Run Vitest test suite in Node environment
 *    //    (Vitest + React Testing Library — no browser dependency)
 *    // 3. Parse output into structured result: { testName, assertion, trace }[]
 *    // 4. If Phase 1 fails: route to retry (see retry logic below)
 *    //
 *    // PHASE 2 — Adversarial QA (LLM pass)
 *    // 5. Prompt LLM with generated code and Phase 1 test suite
 *    //    Role: senior QA engineer attempting to break the implementation
 *    //    Task: identify edge cases, error boundaries, and unexpected inputs
 *    //          not covered by the existing tests
 *    // 6. Receive additional { filePath, content }[] test files
 *    // 7. Run additional tests in Vitest
 *    // 8. Parse output into structured result
 *    // 9. If Phase 2 fails: route to retry (see retry logic below)
 *    //
 *    // RETRY LOGIC (applies to failure in either phase)
 *    // - Write structured test output to state.qaResult
 *    // - If retryCount < 1: set status = 'running', route back to Code Generator
 *    //   with failing test traces as additional context
 *    // - If retryCount === 1: set status = 'failed', post structured comment
 *    //   to issue with exact failures and action needed, stop pipeline
 *    //
 *    // 10. If both phases pass: write results to state, continue to PR Generator
 *    //
 *    // 11. Update state logs

 *    return {
 *      status: allPassed ? 'running' : 'failed',
 *      qaResult: { phase1: phase1Result, phase2: phase2Result },
 *      logs: [...state.logs, buildLog('QAAgent', allPassed ? 'Both phases passed' : 'Failed — routed to retry', allPassed ? 'success' : 'failure')]
 *    };
 * }
 */