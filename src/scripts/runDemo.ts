import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { harnessGraph } from '../graph/graph';
import { HarnessState } from '../state/harnessState';

/**
 * runLiveDemo.ts
 * 
 * An interactive or sequential runner specifically designed for live 
 * interview demonstrations. It processes three specific mock issues:
 * 1. The Business Analyst Issue (High-level criteria)
 * 2. The Tech Lead Issue (Deep technical details)
 * 3. The Intentionally Vague Issue (Demonstrates pipeline rejection)
 */

const DEMO_FILES = [
  'src/mocks/webhooks/vague-feature.json', 
  'src/mocks/webhooks/ba-drug-interaction.json',
  'src/mocks/webhooks/tech-lead-drug-interaction.json',
  'src/mocks/webhooks/complex-multi-task.json',
];

async function runDemo() {
  console.log('\n============================================================');
  console.log('🚀 INITIALIZING AI HARNESS LIVE DEMO');
  console.log('============================================================\n');

  for (let i = 0; i < DEMO_FILES.length; i++) {
    const filePath = DEMO_FILES[i];
    const fullPath = path.resolve(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.error(`[Error] Could not find mock issue at: ${fullPath}`);
      continue;
    }

    const payload = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    
    console.log(`\n\n▶️ DEMO ${i + 1} / ${DEMO_FILES.length}`);
    console.log(`[Input Webhook]: ${path.basename(filePath)}`);
    console.log(`[Issue Author]: ${payload.issue.user.login}`);
    console.log(`[Issue Title]: ${payload.issue.title}`);
    console.log(`------------------------------------------------------------`);
    console.log(`[Ticket Body]:\n${payload.issue.body}`);
    console.log(`\nInvoking live AI Harness (this will cost tokens)...\n`);

    // Initialize clean state for this issue
    const initialState: HarnessState = {
      status: 'running',
      issue: {
        number: payload.issue.number,
        title: payload.issue.title,
        body: payload.issue.body,
        labels: payload.issue.labels?.map((l: any) => l.name) || [],
      },
      subtasks: [],
      logs: [],
    };

    try {
      // Invoke the LangGraph orchestrator
      const finalState = await harnessGraph.invoke(initialState) as HarnessState;
      
      console.log(`\n============================================================`);
      console.log(`✅ DEMO ${i + 1} COMPLETE`);
      console.log(`[Final Node Status]: ${finalState.status.toUpperCase()}`);
      console.log(`============================================================`);
      
      if (finalState.status === 'needs_clarification') {
        console.log(`\n⚠️  SYSTEM REJECTED THE TICKET`);
        console.log(`[Rejection Reason]:\n${finalState.rejectionReason}`);
      } else if (finalState.status === 'done' || finalState.status === 'running') {
        console.log(`\n✅ SYSTEM PASSED THE TICKET`);
        console.log(`\n[Generated Subtasks]: ${finalState.subtasks.length}`);
        finalState.subtasks.forEach((task, idx) => {
          console.log(`  [${idx + 1}] ${task.title}`);
          console.log(`       ${task.description}`);
        });

        // If Medplum Context was loaded, show a summary
        if (finalState.medplumContext) {
          console.log(`\n🧩 MEDPLUM DOMAIN CONTEXT LOADED`);
          console.log(`  Source Entries Used:    ${finalState.medplumContext.selectedSourceEntries.map((e: any) => e.exportName).join(', ')}`);
          console.log(`  FHIR Schemas Used:      ${Object.keys(finalState.medplumContext.selectedFhirSchemas).join(', ')}`);
          console.log(`\n[Agent Code Summary]:\n${finalState.medplumContext.summary}`);
        }
      }

    } catch (error) {
      console.error(`\n❌ PIPELINE CRASHED:`, error);
    }
    
    console.log('\n============================================================\n');
  }
}

// Ensure API keys are present before starting the demo
if (!process.env.GOOGLE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.error("FATAL: No LLM API key found in .env (GOOGLE_API_KEY or ANTHROPIC_API_KEY).");
  process.exit(1);
}

runDemo().catch(console.error);
