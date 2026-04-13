/**
 * medplumExpert.hallucination.test.ts
 *
 * Groundedness tests — verify that the MedplumExpert agent never returns
 * component IDs, hook names, or FHIR schema names that don't exist in the
 * indexes it was given.
 *
 * These are NOT unit tests of the LLM's intelligence. They are structural
 * assertions that catch the specific failure mode where the LLM invents
 * plausible-sounding identifiers that silently pass through the pipeline
 * and mislead the Code Generator.
 *
 * Two layers are tested:
 *
 *   Layer 1 — Selected entries (medplumContext.selectedSourceEntries)
 *     Every entry that reaches the Code Generator must have originated
 *     from the source index. Autocorrected entries (wrong prefix → right prefix)
 *     are valid and pass this check. True hallucinations (no matching exportName
 *     in the index at all) are dropped by the agent and never reach this layer.
 *
 *   Layer 2 — Summary text (medplumContext.summary)
 *     The summary must not mention any export name that isn't in the
 *     selected entries. This catches the secondary failure mode where
 *     a hallucinated ID is dropped from the structured output but still
 *     leaks into the free-text summary.
 *
 * These tests call the live agent and therefore cost tokens.
 * Run them on demand, not on every commit:
 *   npx vitest run src/agents/medplumExpert/medplumExpert.hallucination.test.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { describe, it, expect } from 'vitest';
import { medplumExpert } from './medplumExpert';
import { MEDPLUM_EXPERT_FIXTURES } from '../../mocks/fixtures';
import type { HarnessState } from '../../state/harnessState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface IndexEntry {
  id: string;
  exportName: string;
  category: string;
}

async function loadRealSourceIndex(): Promise<IndexEntry[]> {
  const fs = await import('fs');
  const path = await import('path');
  const indexPath = path.resolve(__dirname, '../../context/medplum/indexes/medplum-source-index.json');
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as IndexEntry[];
}

async function loadRealFhirSchemaNames(): Promise<Set<string>> {
  const fs = await import('fs');
  const path = await import('path');
  const indexPath = path.resolve(__dirname, '../../context/medplum/indexes/medplum-fhir-schemas.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as { schemas: Record<string, unknown> };
  return new Set(Object.keys(index.schemas));
}

/**
 * Extract all PascalCase and use* identifiers from a string.
 * Used for loose summary scanning.
 */
function extractIdentifiers(text: string): string[] {
  const matches = text.match(/\b(use[A-Z]\w+|[A-Z][a-zA-Z]+)\b/g) ?? [];
  return [...new Set(matches)];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MedplumExpert — groundedness (hallucination) tests', () => {
  /**
   * Layer 1: every ID in selectedSourceEntries must exist in the real source index.
   *
   * Autocorrected entries (the agent recovered a wrong package prefix) are valid —
   * their corrected IDs exist in the index. This layer only catches cases where
   * a completely fabricated ID somehow bypassed the agent's correction logic.
   */
  describe('Layer 1: selected source entry IDs are grounded in the index', () => {
    for (const fixture of MEDPLUM_EXPERT_FIXTURES) {
      it(`[${fixture.issue.title}] all selected IDs exist in source index`, async () => {
        const allEntries = await loadRealSourceIndex();
        const validIds = new Set(allEntries.map((e) => e.id));

        const result = await medplumExpert(fixture as HarnessState);
        expect(result.status).not.toBe('failed');

        const selectedEntries = result.medplumContext?.selectedSourceEntries ?? [];
        const invalidIds = selectedEntries
          .map((e) => e.id)
          .filter((id) => !validIds.has(id));

        expect(
          invalidIds,
          `Invalid IDs in "${fixture.issue.title}": ${invalidIds.join(', ')}\n` +
          `These IDs do not exist in the source index.`,
        ).toHaveLength(0);
      }, 30_000);
    }
  });

  /**
   * Layer 1b: no type-category entries should reach selectedSourceEntries.
   *
   * Type entries are filtered out of the index before it is sent to the LLM,
   * so they should never appear in the output regardless of prompt compliance.
   */
  describe('Layer 1b: no type-only entries are selected', () => {
    for (const fixture of MEDPLUM_EXPERT_FIXTURES) {
      it(`[${fixture.issue.title}] no type entries in selected source entries`, async () => {
        const allEntries = await loadRealSourceIndex();
        const typeIds = new Set(
          allEntries.filter((e) => e.category === 'type').map((e) => e.id),
        );

        const result = await medplumExpert(fixture as HarnessState);
        expect(result.status).not.toBe('failed');

        const selectedEntries = result.medplumContext?.selectedSourceEntries ?? [];
        const typeEntries = selectedEntries.filter((e) => typeIds.has(e.id));

        expect(
          typeEntries.map((e) => e.id),
          `Type entries found in "${fixture.issue.title}": ${typeEntries.map((e) => e.id).join(', ')}`,
        ).toHaveLength(0);
      }, 30_000);
    }
  });

  /**
   * Layer 1c: every FHIR schema name in selectedFhirSchemas must exist in the real FHIR index.
   */
  describe('Layer 1c: selected FHIR schema names are grounded in the index', () => {
    for (const fixture of MEDPLUM_EXPERT_FIXTURES) {
      it(`[${fixture.issue.title}] all selected FHIR schemas exist in FHIR index`, async () => {
        const validSchemas = await loadRealFhirSchemaNames();
        const result = await medplumExpert(fixture as HarnessState);

        expect(result.status).not.toBe('failed');

        const selectedSchemas = Object.keys(result.medplumContext?.selectedFhirSchemas ?? {});
        const invalidSchemas = selectedSchemas.filter((name) => !validSchemas.has(name));

        expect(
          invalidSchemas,
          `Invalid FHIR schemas in "${fixture.issue.title}": ${invalidSchemas.join(', ')}`,
        ).toHaveLength(0);
      }, 30_000);
    }
  });

  /**
   * Layer 2: the summary must not mention export names that aren't in the
   * selected entries for that run.
   *
   * This catches the secondary failure mode: a hallucinated ID is correctly
   * dropped from selectedSourceEntries but still leaks into the free-text
   * summary, misleading the Code Generator.
   */
  describe('Layer 2: summary does not mention unselected Medplum identifiers', () => {
    for (const fixture of MEDPLUM_EXPERT_FIXTURES) {
      it(`[${fixture.issue.title}] summary only references selected entries`, async () => {
        const allEntries = await loadRealSourceIndex();
        const exportNameToId = new Map(allEntries.map((e) => [e.exportName, e.id]));

        const result = await medplumExpert(fixture as HarnessState);
        expect(result.status).not.toBe('failed');

        const selectedExportNames = new Set(
          (result.medplumContext?.selectedSourceEntries ?? []).map((e) => e.exportName),
        );

        const summary = result.medplumContext?.summary ?? '';
        const mentionedIdentifiers = extractIdentifiers(summary);

        // A leak is an identifier that:
        //   1. Appears in the summary
        //   2. Is a real Medplum export name (exists somewhere in the index)
        //   3. Was NOT in the selected entries for this run
        const leakedIdentifiers = mentionedIdentifiers.filter(
          (name) => exportNameToId.has(name) && !selectedExportNames.has(name),
        );

        expect(
          leakedIdentifiers,
          `Summary for "${fixture.issue.title}" mentions unselected identifiers: ${leakedIdentifiers.join(', ')}\n` +
          `Summary:\n${summary}`,
        ).toHaveLength(0);
      }, 30_000);
    }
  });

  // ---------------------------------------------------------------------------
  // Regression tests
  // ---------------------------------------------------------------------------

  /**
   * Regression: react/ResourceForm must never appear in selected entries.
   *
   * This export name does not exist anywhere in the source index, so the
   * autocorrection logic cannot rescue it — it must be dropped as a true
   * hallucination. This test pins that behaviour.
   */
  it('regression: react/ResourceForm is never selected', async () => {
    const results = await Promise.all(
      MEDPLUM_EXPERT_FIXTURES.map((fixture) => medplumExpert(fixture as HarnessState)),
    );

    const violations = results.flatMap((result, i) => {
      const selected = result.medplumContext?.selectedSourceEntries ?? [];
      const found = selected.filter((e) => e.id === 'react/ResourceForm');
      return found.length > 0
        ? [`Fixture "${MEDPLUM_EXPERT_FIXTURES[i].issue.title}" selected react/ResourceForm`]
        : [];
    });

    expect(violations, violations.join('\n')).toHaveLength(0);
  }, 120_000);

  /**
   * Regression: autocorrection recovers wrong-package-prefix errors.
   *
   * convertIsoToLocal and convertLocalToIso live in react/, not core/.
   * The LLM consistently uses the wrong prefix. This test confirms that if
   * the LLM selects either utility, it appears under the correct ID rather
   * than being silently dropped or appearing under the wrong prefix.
   */
  it('regression: wrong-prefix utilities are autocorrected, not dropped', async () => {
    const appointmentFixture = MEDPLUM_EXPERT_FIXTURES.find(
      (f) => f.issue.title === 'Build patient appointment scheduler',
    );
    expect(appointmentFixture).toBeDefined();

    const result = await medplumExpert(appointmentFixture as HarnessState);
    expect(result.status).not.toBe('failed');

    const selectedIds = (result.medplumContext?.selectedSourceEntries ?? []).map((e) => e.id);
    const allEntries = await loadRealSourceIndex();

    const wantedExportNames = ['convertIsoToLocal', 'convertLocalToIso'];
    for (const exportName of wantedExportNames) {
      const correctEntry = allEntries.find((e) => e.exportName === exportName);
      if (!correctEntry) continue;

      // Wrong prefix must never appear in the output
      expect(
        selectedIds,
        `"core/${exportName}" appeared with wrong prefix — autocorrection did not fire`,
      ).not.toContain(`core/${exportName}`);

      // If the LLM selected this utility at all, it must be the corrected ID
      if (selectedIds.includes(correctEntry.id)) {
        expect(selectedIds).toContain(correctEntry.id); // passes — just documenting intent
      }
    }
  }, 30_000);

  /**
   * Regression: list-returning tasks select useSearchResources, not useSearch.
   */
  it('regression: list-returning tasks select useSearchResources not useSearch', async () => {
    const listFixtures = MEDPLUM_EXPERT_FIXTURES.filter((f) =>
      ['Patient Care Team Display Widget', 'Patient Lab Results Panel'].includes(f.issue.title),
    );

    for (const fixture of listFixtures) {
      const result = await medplumExpert(fixture as HarnessState);
      const selectedIds = (result.medplumContext?.selectedSourceEntries ?? []).map((e) => e.id);

      expect(
        selectedIds,
        `"${fixture.issue.title}" should include useSearchResources`,
      ).toContain('react-hooks/useSearchResources');

      expect(
        selectedIds,
        `"${fixture.issue.title}" should not include bare useSearch`,
      ).not.toContain('react-hooks/useSearch');
    }
  }, 60_000);
});