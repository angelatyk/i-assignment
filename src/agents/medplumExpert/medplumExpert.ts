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
  MedplumContextDocument,
  MedplumSourceEntry,
} from '../../state/harnessState';
import { getModel, countTokens } from '../../utils/llmFactory';
import { buildLog } from '../../utils/buildLog';
import {
  SOURCE_FILTER_SYSTEM_PROMPT,
  FHIR_FILTER_SYSTEM_PROMPT,
  CONTEXT_SUMMARY_SYSTEM_PROMPT,
} from '../../prompts/medplumExpertPrompts';
import type {
  SourceIndexEntry,
  FhirSchema,
  FhirSchemaIndex,
} from './medplumExpert.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Anchor paths to this file's location, not process.cwd(), so the agent
// works regardless of which directory the process is started from.
const OUTPUT_DIR = path.resolve(__dirname, '../../context/medplum/indexes');
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
    'Array of source entry IDs to include (e.g. ["react/ReferenceInput", "react-hooks/useMedplum"])'
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
  try {
    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
    return lines.slice(0, MAX_SNIPPET_LINES).join('\n');
  } catch {
    // Log a warning but return empty string — the Code Generator will
    // still receive the entry's description and metadata from the index.
    console.warn(`[MedplumExpert] Could not read source snippet for: ${filePath}`);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Package-prefix autocorrection
// ---------------------------------------------------------------------------

/**
 * Result of attempting to autocorrect a missing ID.
 */
interface CorrectionResult {
  /** IDs that were wrong-package-prefixed and successfully corrected. */
  corrected: SourceIndexEntry[];
  /** IDs that do not exist in the index under any package — true hallucinations. */
  trulyMissing: string[];
}

/**
 * Attempt to recover from wrong-package-prefix errors.
 *
 * The LLM sometimes returns a correct export name with the wrong package prefix
 * (e.g. "core/convertIsoToLocal" when the real ID is "react/convertIsoToLocal").
 * This function looks up each missing ID by its export name fragment and, if
 * exactly one match exists in the index, treats it as a recoverable correction.
 *
 * If multiple entries share the same export name (ambiguous) or none exist
 * (true hallucination), the ID is placed in trulyMissing instead.
 */
function attemptPrefixCorrection(
  missingIds: string[],
  sourceIndex: SourceIndexEntry[],
): CorrectionResult {
  const corrected: SourceIndexEntry[] = [];
  const trulyMissing: string[] = [];

  for (const id of missingIds) {
    const exportName = id.split('/')[1];
    if (!exportName) {
      trulyMissing.push(id);
      continue;
    }

    const matches = sourceIndex.filter((e) => e.exportName === exportName);

    if (matches.length === 1) {
      console.warn(
        `[MedplumExpert] Auto-corrected wrong package prefix: ${id} → ${matches[0].id}`,
      );
      corrected.push(matches[0]);
    } else if (matches.length > 1) {
      // Ambiguous — multiple packages export the same name. Don't guess.
      console.warn(
        `[MedplumExpert] Ambiguous export name "${exportName}" found in ${matches.length} packages ` +
        `(${matches.map((m) => m.id).join(', ')}). Dropping ID: ${id}`,
      );
      trulyMissing.push(id);
    } else {
      // No match at all — genuine hallucination.
      trulyMissing.push(id);
    }
  }

  return { corrected, trulyMissing };
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
      rejectionReason: 'The AI pipeline encountered a technical error: Medplum indexes are missing. Please run `npm run build:index` to generate the required source and FHIR indexes.',
      logs: [
        ...state.logs,
        buildLog('MedplumExpert', 'Index load failed — run npm run build:index first', 'failure'),
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

  // Exclude type-only entries before sending to LLM — types cannot be
  // imported as runtime values and are useless to the Code Generator.
  // This is a hard filter so the model physically cannot select them,
  // regardless of what the prompt says.
  const runtimeSourceIndex = sourceIndex.filter((e) => e.category !== 'type');

  const sourceIndexSummary = runtimeSourceIndex
    .map((e) => `${e.id} [${e.category}] — ${e.description} | tags: ${e.tags.join(', ')}`)
    .join('\n');

  const sourceFilterLlm = llm.withStructuredOutput(SourceFilterSchema);
  const pass1Message = `SUBTASKS:\n${taskSummary}\n\nSOURCE INDEX:\n${sourceIndexSummary}`;

  const pass1Tokens = await countTokens(pass1Message);
  console.log(`[MedplumExpert] Pass 1 context size: ~${pass1Tokens} tokens`);
  if (pass1Tokens > 100000) {
    return {
      status: 'failed',
      rejectionReason: `The AI pipeline encountered a context window overflow during Source filtering. Input size (~${pass1Tokens} tokens) exceeds the 100k safety threshold.`,
      logs: [
        ...state.logs,
        buildLog('MedplumExpert', `Context window overflow in Pass 1 (${pass1Tokens} tokens)`, 'failure'),
      ],
    };
  }

  let selectedIds: string[] = [];
  try {
    const sourceFilterResult = await sourceFilterLlm.invoke([
      new SystemMessage(SOURCE_FILTER_SYSTEM_PROMPT),
      new HumanMessage(pass1Message),
    ]);
    selectedIds = sourceFilterResult.selectedIds;
    console.log(`[MedplumExpert] Pass 1 selected ${selectedIds.length} source entries: ${selectedIds.join(', ')}`);
  } catch (error) {
    console.error('[MedplumExpert] Source filter LLM call failed:', error);
    return {
      status: 'failed',
      rejectionReason: 'The AI pipeline encountered a technical error: the Language Model API failed during Source filtering. Please try running the harness again.',
      logs: [
        ...state.logs,
        buildLog('MedplumExpert', 'Source filter LLM call failed', 'failure'),
      ],
    };
  }

  // Direct matches from the index
  const directlySelectedEntries = sourceIndex.filter((e) => selectedIds.includes(e.id));

  // IDs returned by the LLM that don't match any index entry
  const rawMissingIds = selectedIds.filter((id) => !sourceIndex.some((e) => e.id === id));

  // Attempt to recover wrong-package-prefix errors before treating as hallucinations
  const { corrected: correctedEntries, trulyMissing } = rawMissingIds.length > 0
    ? attemptPrefixCorrection(rawMissingIds, sourceIndex)
    : { corrected: [], trulyMissing: [] };

  if (trulyMissing.length > 0) {
    console.warn(
      `[MedplumExpert] ${trulyMissing.length} unrecognized IDs dropped (not in index): ${trulyMissing.join(', ')}`,
    );
  }

  // Final set: direct matches + autocorrected entries (deduped by id)
  const seenIds = new Set(directlySelectedEntries.map((e) => e.id));
  const selectedSourceEntries: SourceIndexEntry[] = [...directlySelectedEntries];
  for (const entry of correctedEntries) {
    if (!seenIds.has(entry.id)) {
      selectedSourceEntries.push(entry);
      seenIds.add(entry.id);
    }
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
  const pass2Message = `SUBTASKS:\n${taskSummary}\n\nAVAILABLE FHIR SCHEMAS:\n${fhirSchemaNames}`;

  const pass2Tokens = await countTokens(pass2Message);
  console.log(`[MedplumExpert] Pass 2 context size: ~${pass2Tokens} tokens`);
  if (pass2Tokens > 100000) {
    return {
      status: 'failed',
      rejectionReason: `The AI pipeline encountered a context window overflow during FHIR filtering. Input size (~${pass2Tokens} tokens) exceeds the 100k safety threshold.`,
      logs: [
        ...state.logs,
        buildLog('MedplumExpert', `Context window overflow in Pass 2 (${pass2Tokens} tokens)`, 'failure'),
      ],
    };
  }

  let selectedResourceNames: string[] = [];
  try {
    const fhirFilterResult = await fhirFilterLlm.invoke([
      new SystemMessage(FHIR_FILTER_SYSTEM_PROMPT),
      new HumanMessage(pass2Message),
    ]);
    selectedResourceNames = fhirFilterResult.selectedResourceNames;
    console.log(
      `[MedplumExpert] Pass 2 selected ${selectedResourceNames.length} FHIR schemas: ${selectedResourceNames.join(', ')}`,
    );
  } catch (error) {
    console.error('[MedplumExpert] FHIR filter LLM call failed:', error);
    return {
      status: 'failed',
      rejectionReason: 'The AI pipeline encountered a technical error: the Language Model API failed during FHIR filtering. Please try running the harness again.',
      logs: [
        ...state.logs,
        buildLog('MedplumExpert', 'FHIR filter LLM call failed', 'failure'),
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
    trulyMissing.length > 0
      ? `NOTE: The following IDs were requested but do not exist in the index and must NOT be used: ${trulyMissing.join(', ')}`
      : '',
  ].filter(Boolean).join('\n\n');

  const summaryLlm = llm.withStructuredOutput(SummarySchema);

  const pass3Tokens = await countTokens(summaryContext);
  console.log(`[MedplumExpert] Pass 3 context size: ~${pass3Tokens} tokens`);
  if (pass3Tokens > 100000) {
    return {
      status: 'failed',
      rejectionReason: `The AI pipeline encountered a context window overflow during Summary Generation. Input size (~${pass3Tokens} tokens) exceeds the 100k safety threshold.`,
      logs: [
        ...state.logs,
        buildLog('MedplumExpert', `Context window overflow in Pass 3 (${pass3Tokens} tokens)`, 'failure'),
      ],
    };
  }

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

  const correctionNote = correctedEntries.length > 0
    ? ` (${correctedEntries.length} prefix-corrected)`
    : '';

  const logEntry = buildLog(
    'MedplumExpert',
    `Selected ${selectedSourceEntries.length} source entries${correctionNote} and ` +
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