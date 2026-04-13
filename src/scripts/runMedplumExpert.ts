/**
 * runMedplumExpert.ts — INTEGRATION RUNNER (not a unit test).
 *
 * Runs the MedplumExpert agent against a pre-configured state containing
 * sample subtasks. This uses a LIVE LLM and requires GOOGLE_API_KEY or
 * ANTHROPIC_API_KEY to be set in .env.
 * 
 * IMPORTANT: This reads the actual medplum index files from disk.
 * Ensure you have built them first using `npm run build:index`.
 *
 * Usage:
 *   npx tsx src/scripts/runMedplumExpert.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { medplumExpert } from '../agents/medplumExpert/medplumExpert';
import { MEDPLUM_EXPERT_FIXTURES } from '../mocks/fixtures';
import type { HarnessState } from '../state/harnessState';

async function runFixture(state: HarnessState, index: number): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fixture [${index + 1}/${MEDPLUM_EXPERT_FIXTURES.length}]: ${state.issue.title}`);
  console.log('='.repeat(60));

  console.log(`\nInput Subtasks:`);
  state.subtasks.forEach((task, i) => {
    console.log(`  [${i + 1}] ${task.title}`);
    console.log(`       ${task.description}`);
  });

  console.log('\nInvoking live MedplumExpert (this will cost tokens)...\n');

  try {
    const result = await medplumExpert(state);

    console.log('\n--- Result ---');
    
    if (result.status === 'failed') {
      console.log('AGENT FAILED.');
      console.log(result.logs?.[result.logs.length - 1]?.decision);
      return;
    }

    if (result.medplumContext) {
      const { selectedSourceEntries, selectedFhirSchemas, summary } = result.medplumContext;
      
      console.log(`\nSelected Source Entries (${selectedSourceEntries.length}):`);
      selectedSourceEntries.forEach((entry) => {
        console.log(`  - ${entry.exportName} [${entry.importPath}]`);
      });

      const schemaNames = Object.keys(selectedFhirSchemas);
      console.log(`\nSelected FHIR Schemas (${schemaNames.length}):`);
      schemaNames.forEach((name) => {
        console.log(`  - ${name}`);
      });

      console.log(`\nGenerated Code Generator Summary:\n`);
      console.log(summary);
    }

    if (result.logs && result.logs.length > 0) {
      const last = result.logs[result.logs.length - 1];
      console.log(`\nLog: [${last.agentName}] ${last.decision} (${last.status}) @ ${last.timestamp}`);
    }

  } catch (error) {
    console.error(`\nIntegration run failed for fixture [${index + 1}]:`, error);
  }
}

async function main(): Promise<void> {
  console.log(`Found ${MEDPLUM_EXPERT_FIXTURES.length} MedplumExpert fixtures to test.`);
  
  for (let i = 0; i < MEDPLUM_EXPERT_FIXTURES.length; i++) {
    await runFixture(MEDPLUM_EXPERT_FIXTURES[i], i);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Integration Testing Complete.`);
}

main();
