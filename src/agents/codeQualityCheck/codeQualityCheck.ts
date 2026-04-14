/**
 * PATH: src/agents/codeQualityCheck/codeQualityCheck.ts
 *
 * ============================================================================
 * PLANNED AGENT: Code Quality Check
 * ============================================================================
 *
 * DESCRIPTION:
 * A deterministic script node — no LLM involved.
 * Runs ESLint, TypeScript compilation, and modularity checks against the
 * generated code. Produces structured, machine-readable error output.
 * On failure, feeds the full error output back to the Code Generator for retry.
 * One retry maximum — exits to human review if retry also fails.
 *
 * HIGH-LEVEL PSEUDOCODE:
 *
 * export async function codeQualityCheck(state: HarnessState): Promise<Partial<HarnessState>> {
 *    // 1. Run ESLint, tsc --noEmit, and modularity checks against state.generatedCode
 *    //
 *    // 2. Parse stdout into structured error output: { file, line, message }[]
 *    //
 *    // 3. If failures:
 *    //    - Write structured errors to state.qualityCheckResult
 *    //    - If retryCount < 1: set status = 'running', route back to Code Generator
 *    //      with full error output as additional context
 *    //    - If retryCount === 1: set status = 'failed', post structured comment
 *    //      to issue with exact failure and action needed, stop pipeline
 *    //
 *    // 4. If passes: write result to state, continue to QA Agent
 *    //
 *    // 5. Update state logs
 *
 *    return {
 *      status: passed ? 'running' : 'failed',
 *      qualityCheckResult: structuredResult,
 *      logs: [...state.logs, buildLog('CodeQualityCheck', passed ? 'Passed' : 'Failed — routed to retry', passed ? 'success' : 'failure')]
 *    };
 * }
 */