/**
 * medplumExpert.ts — LangGraph node that bridges feature requirements and code generation.
 *
 * Two-pass LLM filter:
 *   Pass 1: Selects relevant source entries (components, hooks, utilities)
 *   Pass 2: Selects relevant FHIR resource schemas
 *
 * Then assembles a MedplumContextDocument that the Code Generator
 * uses to produce correct, SDK-compliant React code.
 */
import * as fs from 'fs';
import * as path from 'path';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type {
  HarnessState,
  LogEntry,
  MedplumContextDocument,
  MedplumSourceEntry,
} from '../state/harnessState';
import type {
  SourceIndexEntry,
  FhirSchema,
  FhirSchemaIndex,
} from './medplumExpert.types';
import { getModel } from '../utils/llmFactory';
import {
  SOURCE_FILTER_SYSTEM_PROMPT,
  FHIR_FILTER_SYSTEM_PROMPT,
  CONTEXT_SUMMARY_SYSTEM_PROMPT,
} from '../prompts/medplumExpertPrompts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_DIR = path.resolve('./context/medplum/indexes');
const SOURCE_INDEX_PATH = path.join(OUTPUT_DIR, 'medplum-source-index.json');
const FHIR_INDEX_PATH = path.join(OUTPUT_DIR, 'medplum-fhir-schemas.json');
const MEDPLUM_REPO_PATH = process.env.MEDPLUM_REPO_PATH ?? './medplum';

/** Max source lines to include per file snippet sent to the Code Generator. */
const MAX_SNIPPET_LINES = 80;

// ---------------------------------------------------------------------------
// Structured output schemas (single source of truth for Zod validation)
// ---------------------------------------------------------------------------

const SourceFilterSchema = z.object({
  selectedIds: z.array(z.string()).describe(
    'Array of source entry IDs to include (e.g. ["react/ResourceForm", "react-hooks/useMedplum"])'
  ),
});

const FhirFilterSchema = z.object({
  selectedResourceNames: z.array(z.string()).describe(
    'Array of FHIR resource/schema names to include (e.g. ["Patient", "Appointment"])'
  ),
});

const SummarySchema = z.object({
  summary: z.string().describe(
    'A concise technical briefing (3-6 sentences) for the Code Generator'
  ),
});

// ---------------------------------------------------------------------------
// Index loading helpers
// ---------------------------------------------------------------------------

/**
 * Load the source index from disk.
 * Throws a clear error message if the file is missing (prompt user to run the script).
 */
function loadSourceIndex(): SourceIndexEntry[] {
  if (!fs.existsSync(SOURCE_INDEX_PATH)) {
    throw new Error(
      `[MedplumExpert] Source index not found at: ${SOURCE_INDEX_PATH}\n` +
      `Run 'npm run build:index:source' to generate it.`,
    );
  }
  try {
    return JSON.parse(fs.readFileSync(SOURCE_INDEX_PATH, 'utf-8')) as SourceIndexEntry[];
  } catch (error) {
    throw new Error(`[MedplumExpert] Failed to parse source index: ${error}`);
  }
}

/**
 * Load the FHIR schema index from disk.
 * Throws a clear error message if the file is missing.
 */
function loadFhirIndex(): FhirSchemaIndex {
  if (!fs.existsSync(FHIR_INDEX_PATH)) {
    throw new Error(
      `[MedplumExpert] FHIR schema index not found at: ${FHIR_INDEX_PATH}\n` +
      `Run 'npm run build:index:fhir' to generate it.`,
    );
  }
  try {
    return JSON.parse(fs.readFileSync(FHIR_INDEX_PATH, 'utf-8')) as FhirSchemaIndex;
  } catch (error) {
    throw new Error(`[MedplumExpert] Failed to parse FHIR schema index: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Source snippet fetcher
// ---------------------------------------------------------------------------

/**
 * Read the full source of a file from the Medplum repo and return
 * the first MAX_SNIPPET_LINES lines as a snippet for the Code Generator.
 */
function readSourceSnippet(filePath: string): string {
  const fullPath = path.join(path.resolve(MEDPLUM_REPO_PATH), filePath);
  if (!fs.existsSync(fullPath)) return '// Source file not found';
  const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
  return lines.slice(0, MAX_SNIPPET_LINES).join('\n');
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * medplumExpert is a LangGraph node that identifies what Medplum components,
 * hooks, and FHIR resource types are needed to implement the current task list.
 *
 * It uses a two-pass LLM filter:
 *   Pass 1 — selects relevant entries from the source index (react, react-hooks, core)
 *   Pass 2 — selects relevant FHIR resource schemas from the OpenAPI-derived index
 *
 * Then assembles a MedplumContextDocument for the Code Generator.
 *
 * @param state - The current HarnessState (must have subtasks populated)
 * @returns Partial state update with medplumContext populated
 */
export async function medplumExpert(state: HarnessState): Promise<Partial<HarnessState>> {
  console.log('[MedplumExpert] Starting Medplum context assembly...');

  // ------------------------------------------------------------------
  // 1. Load indexes
  // ------------------------------------------------------------------
  let sourceIndex: SourceIndexEntry[];
  let fhirIndex: FhirSchemaIndex;

  try {
    sourceIndex = loadSourceIndex();
    fhirIndex = loadFhirIndex();
  } catch (error) {
    console.error('[MedplumExpert] Index load failed:', error);
    return {
      status: 'failed',
      logs: [
        ...state.logs,
        buildLog('Index load failed — run npm run build:index first', 'failure'),
      ],
    };
  }

  console.log(
    `[MedplumExpert] Loaded ${sourceIndex.length} source entries, ` +
    `${Object.keys(fhirIndex.schemas).length} FHIR schemas`,
  );

  const taskSummary = state.subtasks
    .map((t, i) => `${i + 1}. ${t.title}: ${t.description}`)
    .join('\n');

  const llm = getModel();

  // ------------------------------------------------------------------
  // 2. Pass 1 — filter source entries
  // ------------------------------------------------------------------
  console.log('[MedplumExpert] Pass 1: filtering source entries...');

  const sourceIndexSummary = sourceIndex
    .map((e) => `${e.id} [${e.category}] — ${e.description} | tags: ${e.tags.join(', ')}`)
    .join('\n');

  const sourceFilterLlm = llm.withStructuredOutput(SourceFilterSchema);

  let selectedIds: string[] = [];
  try {
    const sourceFilterResult = await sourceFilterLlm.invoke([
      new SystemMessage(SOURCE_FILTER_SYSTEM_PROMPT),
      new HumanMessage(
        `SUBTASKS:\n${taskSummary}\n\nSOURCE INDEX:\n${sourceIndexSummary}`,
      ),
    ]);
    selectedIds = sourceFilterResult.selectedIds;
    console.log(`[MedplumExpert] Pass 1 selected ${selectedIds.length} source entries: ${selectedIds.join(', ')}`);
  } catch (error) {
    console.error('[MedplumExpert] Source filter LLM call failed:', error);
    return {
      status: 'failed',
      logs: [
        ...state.logs,
        buildLog('Source filter LLM call failed', 'failure'),
      ],
    };
  }

  const selectedSourceEntries = sourceIndex.filter((e) => selectedIds.includes(e.id));

  // Warn about IDs that were returned by the LLM but don't exist in the index
  const missingIds = selectedIds.filter((id) => !sourceIndex.some((e) => e.id === id));
  if (missingIds.length > 0) {
    console.warn(`[MedplumExpert] LLM returned ${missingIds.length} unrecognized IDs: ${missingIds.join(', ')}`);
  }

  // Read source snippets for selected entries
  const fullSourceSnippets: Record<string, string> = {};
  for (const entry of selectedSourceEntries) {
    fullSourceSnippets[entry.id] = readSourceSnippet(entry.filePath);
  }

  // ------------------------------------------------------------------
  // 3. Pass 2 — filter FHIR schemas
  // ------------------------------------------------------------------
  console.log('[MedplumExpert] Pass 2: filtering FHIR schemas...');

  const fhirSchemaNames = Object.keys(fhirIndex.schemas).join(', ');

  const fhirFilterLlm = llm.withStructuredOutput(FhirFilterSchema);

  let selectedResourceNames: string[] = [];
  try {
    const fhirFilterResult = await fhirFilterLlm.invoke([
      new SystemMessage(FHIR_FILTER_SYSTEM_PROMPT),
      new HumanMessage(
        `SUBTASKS:\n${taskSummary}\n\nAVAILABLE FHIR SCHEMAS:\n${fhirSchemaNames}`,
      ),
    ]);
    selectedResourceNames = fhirFilterResult.selectedResourceNames;
    console.log(
      `[MedplumExpert] Pass 2 selected ${selectedResourceNames.length} FHIR schemas: ${selectedResourceNames.join(', ')}`,
    );
  } catch (error) {
    console.error('[MedplumExpert] FHIR filter LLM call failed:', error);
    return {
      status: 'failed',
      logs: [
        ...state.logs,
        buildLog('FHIR filter LLM call failed', 'failure'),
      ],
    };
  }

  const selectedFhirSchemas: Record<string, FhirSchema> = {};
  for (const name of selectedResourceNames) {
    if (fhirIndex.schemas[name]) {
      selectedFhirSchemas[name] = fhirIndex.schemas[name];
    } else {
      console.warn(`[MedplumExpert] LLM selected unknown FHIR schema: ${name}`);
    }
  }

  // ------------------------------------------------------------------
  // 4. Generate context summary for the Code Generator
  // ------------------------------------------------------------------
  console.log('[MedplumExpert] Generating context summary...');

  const summaryContext = [
    `SUBTASKS:\n${taskSummary}`,
    `SELECTED SOURCE ENTRIES:\n${selectedSourceEntries.map((e) => `- ${e.id}: ${e.description}`).join('\n')}`,
    `SELECTED FHIR SCHEMAS:\n${Object.keys(selectedFhirSchemas).join(', ')}`,
  ].join('\n\n');

  const summaryLlm = llm.withStructuredOutput(SummarySchema);

  let summary = '';
  try {
    const summaryResult = await summaryLlm.invoke([
      new SystemMessage(CONTEXT_SUMMARY_SYSTEM_PROMPT),
      new HumanMessage(summaryContext),
    ]);
    summary = summaryResult.summary;
    console.log(`[MedplumExpert] Summary generated (${summary.length} chars)`);
  } catch (error) {
    console.error('[MedplumExpert] Summary LLM call failed:', error);
    // Non-fatal — we still have the structured data; summarize manually
    summary = `Use ${selectedSourceEntries.map((e) => e.exportName).join(', ')} from Medplum React SDK. ` +
      `FHIR resources involved: ${Object.keys(selectedFhirSchemas).join(', ')}.`;
  }

  // ------------------------------------------------------------------
  // 5. Assemble MedplumContextDocument and update state
  // ------------------------------------------------------------------
  const leanEntries: MedplumSourceEntry[] = selectedSourceEntries.map((e) => ({
    id: e.id,
    exportName: e.exportName,
    importPath: e.importPath,
    category: e.category,
    description: e.description,
    tags: e.tags,
  }));

  const medplumContext: MedplumContextDocument = {
    selectedSourceEntries: leanEntries,
    fullSourceSnippets,
    selectedFhirSchemas,
    summary,
  };

  const logEntry: LogEntry = buildLog(
    `Selected ${selectedSourceEntries.length} source entries and ` +
    `${Object.keys(selectedFhirSchemas).length} FHIR schemas. ` +
    `Summary: ${summary.slice(0, 120)}...`,
    'success',
  );

  console.log('[MedplumExpert] Context assembly complete.');

  return {
    medplumContext,
    logs: [...state.logs, logEntry],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildLog(decision: string, status: LogEntry['status']): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    agentName: 'MedplumExpert',
    decision,
    status,
  };
}
