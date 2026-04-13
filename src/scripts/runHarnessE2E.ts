/**
 * runHarnessE2E.ts — END-TO-END PIPELINE RUNNER (not a unit test).
 *
 * Runs the entire active LangGraph pipeline (HarnessGraph) against all 
 * webhook payloads in src/mocks/webhooks/ using a LIVE LLM.
 * 
 * Takes an issue from start (IssueAnalyzer) to current END (MedplumExpert)
 * exactly as it would in production.
 *
 * Usage:
 *   npx tsx src/scripts/runHarnessE2E.ts
 *
 * This script validates real LLM behaviour and agent transitions end-to-end 
 * and should not be run in CI. It costs tokens.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { harnessGraph } from '../graph/graph';
import { HarnessState, LogEntry } from '../state/harnessState';

async function runE2E(mockFileName: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running E2E Pipeline for: ${mockFileName}`);
  console.log('='.repeat(60));

  const mockPath = path.join(__dirname, '../mocks/webhooks', mockFileName);
  const mockData = JSON.parse(fs.readFileSync(mockPath, 'utf-8')) as {
    issue: {
      number: number;
      title: string;
      body: string;
      labels: Array<{ name: string }>;
    };
  };

  const initialState: HarnessState = {
    issue: {
      number: mockData.issue.number,
      title: mockData.issue.title,
      body: mockData.issue.body,
      labels: mockData.issue.labels.map((l) => l.name),
    },
    subtasks: [],
    status: 'running',
    logs: [],
  };

  console.log(`Issue #${initialState.issue.number}: ${initialState.issue.title}`);
  console.log(`Invoking Live StateGraph...\n`);

  try {
    const finalState = await harnessGraph.invoke(initialState);

    console.log('\n--- Pipeline Terminated ---');
    console.log(`Final Status: ${finalState.status}`);

    if (finalState.status === 'needs_clarification') {
      console.log(`Outcome: REJECTED`);
      console.log(`Rejection Reason: ${finalState.rejectionReason}`);
    } else if (finalState.status === 'running' || finalState.status === 'done') {
      console.log(`Outcome: PASSED AND CONTEXT GATHERED`);
      console.log(`Subtasks Generated: ${finalState.subtasks?.length || 0}`);
      if (finalState.medplumContext) {
        console.log(`Gathered Medplum Context:`);
        console.log(`  - Source Entries: ${finalState.medplumContext.selectedSourceEntries.length}`);
        console.log(`  - FHIR Schemas: ${Object.keys(finalState.medplumContext.selectedFhirSchemas).length}`);
      }
    } else if (finalState.status === 'failed') {
      console.log(`Outcome: PIPELINE FAILED`);
    }

    console.log(`\n--- Agent Execution Log ---`);
    if (finalState.logs && finalState.logs.length > 0) {
      finalState.logs.forEach((log: LogEntry) => {
        console.log(`[${log.agentName}] ${log.status.toUpperCase()} -> ${log.decision}`);
      });
    }

  } catch (error) {
    console.error(`\nE2E Run failed for ${mockFileName}:`, error);
  }
}

async function main(): Promise<void> {
  try {
    const webhooksDir = path.join(__dirname, '../mocks/webhooks');
    const files = fs.readdirSync(webhooksDir).filter((f) => f.endsWith('.json'));

    console.log(`Found ${files.length} webhook payloads for E2E testing.`);

    // Run sequentially to prevent LLM rate limiting or massive parallel costs
    for (let i = 0; i < files.length; i++) {
        await runE2E(files[i]);
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`E2E Testing Complete.`);
    
  } catch (error) {
    console.error('\nE2E runner initialization failed:', error);
    process.exit(1);
  }
}

main();
