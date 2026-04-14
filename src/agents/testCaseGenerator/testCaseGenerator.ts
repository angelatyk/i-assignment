/**
 * PATH: src/agents/testCaseGenerator/testCaseGenerator.ts
 *
 * ============================================================================
 * PLANNED AGENT: Test Case Generator
 * ============================================================================
 *
 * DESCRIPTION:
 * Runs in parallel with the Medplum Expert during the Plan phase.
 * Converts subtasks and acceptance criteria into executable Vitest test cases
 * before any implementation code is written. Tests are spec-derived only —
 * no knowledge of the implementation that will follow.
 *
 * Uses a deliberately different model than the Code Generator to avoid shared
 * blind spots in interpretation and edge case handling.
 *
 * HIGH-LEVEL PSEUDOCODE:
 *
 * export async function testCaseGenerator(state: HarnessState): Promise<Partial<HarnessState>> {
 *    // 1. Read inputs from state:
 *    //    - state.issue (raw GitHub issue — full spec, business context, edge cases)
 *    //    - state.subtasks (structured acceptance criteria from Issue Analyzer)
 *    //
 *    // 2. For each subtask:
 *    //    - Prompt LLM with acceptance criteria and output contract
 *    //    - Testing stack (Vitest + React Testing Library) is injected via prompt
 *    //      — no runtime fetch needed, stack is known and stable
 *    //    - Receive { filePath, content }[] — one test file per subtask
 *    //    - Tests should be red until Code Generator produces satisfying implementation
 *    //
 *    // 3. Accumulate all test files across subtasks
 *    //
 *    // 4. Update state logs
 *
 *    return {
 *      testCases: [...generatedTestFiles],
 *      logs: [...state.logs, buildLog('TestCaseGenerator', 'Test cases generated', 'success')]
 *    };
 * }
 */