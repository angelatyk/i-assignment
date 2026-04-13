/**
 * runIssueAnalyzer.ts — INTEGRATION RUNNER (not a unit test).
 *
 * Runs the IssueAnalyzer agent against all webhook payloads in src/mocks/webhooks/
 * using a live LLM. Requires GOOGLE_API_KEY or ANTHROPIC_API_KEY to be set in .env.
 *
 * Usage:
 *   npx tsx src/scripts/runIssueAnalyzer.ts
 *
 * This script is intentionally separate from the Vitest unit test suite.
 * It validates real LLM behaviour end-to-end and should not be run in CI.
 */
import * as dotenv from 'dotenv';
dotenv.config(); // Must run before any agent import resolves env vars

import * as fs from 'fs';
import * as path from 'path';
import { issueAnalyzer } from '../agents/issueAnalyzer/issueAnalyzer';
import { HarnessState } from '../state/harnessState';

async function runTest(mockFileName: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running Test: ${mockFileName}`);
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

  const result = await issueAnalyzer(initialState);

  console.log('\n--- Result ---');
  console.log(`Status: ${result.status}`);

  if (result.subtasks && result.subtasks.length > 0) {
    console.log(`\nSubtasks (${result.subtasks.length}):`);
    result.subtasks.forEach((task, i) => {
      console.log(`\n  [${i + 1}] ${task.title}`);
      console.log(`       ${task.description}`);
      console.log(`       AC:   ${task.acceptanceCriteria.join(' | ')}`);
      console.log(`       Deps: ${task.dependencies.length > 0 ? task.dependencies.join(', ') : 'none'}`);
    });
  }

  if (result.rejectionReason) {
    console.log(`\nRejection Comment (for GitHub):\n`);
    console.log(result.rejectionReason);
  }

  if (result.logs && result.logs.length > 0) {
    const last = result.logs[result.logs.length - 1];
    console.log(`\nLog: [${last.agentName}] ${last.decision} (${last.status}) @ ${last.timestamp}`);
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function main(): Promise<void> {
  try {
    const webhooksDir = path.join(__dirname, '../mocks/webhooks');
    const files = fs.readdirSync(webhooksDir).filter((f) => f.endsWith('.json'));

    console.log(`Found ${files.length} webhook payloads to test.`);

    const fileChunks = chunkArray(files, 3); // Process 3 concurrently

    for (let i = 0; i < fileChunks.length; i++) {
      const chunk = fileChunks[i];
      console.log(`\n--- Processing Chunk ${i + 1} of ${fileChunks.length} ---`);
      await Promise.all(chunk.map((file) => runTest(file)));
    }
  } catch (error) {
    console.error('\nIntegration run failed:', error);
    process.exit(1);
  }
}

main();
