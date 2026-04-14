/**
 * PATH: src/agents/codeGenerator/codeGenerator.ts
 * 
 * ============================================================================
 * PLANNED AGENT: Code Generator
 * ============================================================================
 * 
 * DESCRIPTION:
 * The core value step of the pipeline. Receives the full planning context
 * assembled by upstream agents and produces typed TypeScript file outputs
 * targeting the existing codebase.
 * 
 * HIGH-LEVEL PSEUDOCODE:
 * 
 * export async function codeGenerator(state: HarnessState): Promise<Partial<HarnessState>> {
 *    // 1. Gather inputs from state:
 *    //    - state.subtasks (ordered, with explicit dependencies)
 *    //    - state.medplumContext (source snippets, FHIR schemas, narrative briefing)
 *    //    - state.repoMap (target file structure — where to write generated files)
 *    //    - state.testCases (pre-generated from spec by Test Case Generator)
 *    //
 *    // 2. Process subtasks in dependency order:
 *    //    for each subtask (respecting dependencies):
 *    //      - Build prompt with subtask, relevant medplumContext, repoMap, testCases
 *    //      - Invoke LLM with explicit file list and structured output contract
 *    //      - Receive { filePath, content }[] — write files to workspace
 *    //      - Accumulate generated files in state for downstream subtasks to reference
 *    //
 *    // 3. On failure: surface structured error for Code Quality Gate retry loop
 *    //
 *    // 4. Update state logs
 *
 *    return {
 *      generatedCode: [...generatedFiles],
 *      logs: [...state.logs, buildLog('CodeGenerator', 'Code generated', 'success')]
 *    };
 * }
 */