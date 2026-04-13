/**
 * medplumExpert.test.ts — Unit tests for the MedplumExpert agent.
 *
 * All LLM calls and file I/O are mocked. No API key or Medplum repo required.
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that use them.
// Vitest hoists vi.mock() calls automatically.
// ---------------------------------------------------------------------------

vi.mock('fs');
vi.mock('../../utils/llmFactory', () => ({
  getModel: vi.fn(),
}));

// Import after mocks are declared
import { medplumExpert } from './medplumExpert';
import { getModel } from '../../utils/llmFactory';
import {
  MEDPLUM_EXPERT_STATE,
  MOCK_SOURCE_INDEX,
  MOCK_FHIR_INDEX,
} from '../../mocks/fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock LLM that returns the right response for each sequential call.
 * The agent calls withStructuredOutput 3 times in sequence:
 *   1. Pass 1 — source filter
 *   2. Pass 2 — FHIR filter
 *   3. Summary generation
 */
function makeMockLlm(overrides?: {
  selectedIds?: string[];
  selectedResourceNames?: string[];
}) {
  const selectedIds = overrides?.selectedIds ?? ['react/ResourceForm', 'react-hooks/useMedplum'];
  const selectedResourceNames = overrides?.selectedResourceNames ?? ['Patient', 'Appointment'];

  const invokeSource = vi.fn().mockResolvedValue({ selectedIds });
  const invokeFhir = vi.fn().mockResolvedValue({ selectedResourceNames });
  const invokeSummary = vi.fn().mockResolvedValue({ summary: 'Use ResourceForm and useMedplum.' });

  const withStructuredOutput = vi.fn()
    .mockReturnValueOnce({ invoke: invokeSource })
    .mockReturnValueOnce({ invoke: invokeFhir })
    .mockReturnValueOnce({ invoke: invokeSummary });

  return { withStructuredOutput };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('medplumExpert', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Both index files exist by default
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // readFileSync returns the appropriate mock index based on path
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.includes('medplum-source-index')) return JSON.stringify(MOCK_SOURCE_INDEX);
      if (p.includes('medplum-fhir-schemas')) return JSON.stringify(MOCK_FHIR_INDEX);
      // Source snippet reads from the Medplum repo
      return '// mock source\nexport function ResourceForm() {}';
    });

    vi.mocked(getModel).mockReturnValue(makeMockLlm() as unknown as ReturnType<typeof getModel>);
  });

  // --- Happy path ---

  it('returns a MedplumContextDocument with the correct shape', async () => {
    const result = await medplumExpert(MEDPLUM_EXPERT_STATE);

    expect(result.medplumContext).toBeDefined();
    const ctx = result.medplumContext!;

    // Lean source entries (MedplumSourceEntry shape, not raw SourceIndexEntry)
    expect(ctx.selectedSourceEntries).toHaveLength(2);
    expect(ctx.selectedSourceEntries[0].id).toBe('react/ResourceForm');
    expect(ctx.selectedSourceEntries[0].importPath).toBe('@medplum/react');
    expect(ctx.selectedSourceEntries[1].id).toBe('react-hooks/useMedplum');

    // Source snippets keyed by entry id
    expect(typeof ctx.fullSourceSnippets['react/ResourceForm']).toBe('string');

    // FHIR schemas present and correctly keyed
    const schemas = ctx.selectedFhirSchemas as Record<string, { name: string }>;
    expect(schemas['Patient']).toBeDefined();
    expect(schemas['Appointment']).toBeDefined();

    // Summary is a non-empty string
    expect(typeof ctx.summary).toBe('string');
    expect(ctx.summary.length).toBeGreaterThan(0);
  });

  it('appends a success log entry to state on completion', async () => {
    const result = await medplumExpert(MEDPLUM_EXPERT_STATE);

    const logs = result.logs ?? [];
    const expertLog = logs.find((l) => l.agentName === 'MedplumExpert');
    expect(expertLog).toBeDefined();
    expect(expertLog!.status).toBe('success');
  });

  // --- Empty LLM selection ---

  it('returns a valid context document with empty arrays when the LLM selects nothing', async () => {
    vi.mocked(getModel).mockReturnValue(
      makeMockLlm({ selectedIds: [], selectedResourceNames: [] }) as unknown as ReturnType<typeof getModel>
    );

    const result = await medplumExpert(MEDPLUM_EXPERT_STATE);

    // Should not crash — context document should still be a valid shape
    expect(result.medplumContext).toBeDefined();
    const ctx = result.medplumContext!;
    expect(ctx.selectedSourceEntries).toHaveLength(0);
    expect(Object.keys(ctx.selectedFhirSchemas)).toHaveLength(0);
    expect(typeof ctx.summary).toBe('string');
  });

  // --- Error handling: missing index files ---

  it('returns status:failed and a failure log when the source index file is missing', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: unknown) =>
      !String(p).includes('medplum-source-index'),
    );

    const result = await medplumExpert(MEDPLUM_EXPERT_STATE);

    expect(result.status).toBe('failed');
    const expertLog = (result.logs ?? []).find((l) => l.agentName === 'MedplumExpert');
    expect(expertLog?.status).toBe('failure');
  });

  it('returns status:failed and a failure log when the FHIR schema index file is missing', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: unknown) =>
      !String(p).includes('medplum-fhir-schemas'),
    );

    const result = await medplumExpert(MEDPLUM_EXPERT_STATE);

    expect(result.status).toBe('failed');
    const expertLog = (result.logs ?? []).find((l) => l.agentName === 'MedplumExpert');
    expect(expertLog?.status).toBe('failure');
  });

  // --- Immutability ---

  it('does not mutate the incoming state.logs array', async () => {
    const originalLength = MEDPLUM_EXPERT_STATE.logs.length;
    await medplumExpert(MEDPLUM_EXPERT_STATE);
    expect(MEDPLUM_EXPERT_STATE.logs.length).toBe(originalLength);
  });
});
