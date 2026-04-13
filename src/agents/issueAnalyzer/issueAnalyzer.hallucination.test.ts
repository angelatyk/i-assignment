/**
 * issueAnalyzer.hallucination.test.ts
 *
 * Groundedness & DAG Integrity tests — verify that when the IssueAnalyzer
 * agent generates subtasks, it does not hallucinate dependencies that don't
 * exist, and it does not create circular dependency graphs.
 *
 * These are NOT unit tests of the LLM's intelligence. They are structural
 * assertions that catch specific failure modes where the LLM breaks the
 * strict DAG interface required by the LangGraph orchestrator.
 *
 * These tests call the live agent and therefore cost tokens.
 * Run them on demand, not on every commit:
 *   npx vitest run src/agents/issueAnalyzer/issueAnalyzer.hallucination.test.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { describe, it, expect } from 'vitest';
import { issueAnalyzer } from './issueAnalyzer';
import { PASS_ISSUES } from '../../mocks/fixtures';
import type { HarnessState } from '../../state/harnessState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a graph represented by an adjacency list contains a cycle.
 * @param adjacencyList Map from node title to array of dependency titles.
 * @returns boolean True if a cycle is found, false otherwise.
 */
function hasCycle(adjacencyList: Map<string, string[]>): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string): boolean {
    if (recursionStack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    recursionStack.add(node);

    const deps = adjacencyList.get(node) || [];
    for (const dep of deps) {
      if (dfs(dep)) return true;
    }

    recursionStack.delete(node);
    return false;
  }

  for (const node of adjacencyList.keys()) {
    if (dfs(node)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueAnalyzer — groundedness (DAG structural) tests', () => {
  
  describe('Dependency references match actual subtask titles', () => {
    for (const fixture of PASS_ISSUES) {
      it(`[${fixture.issue.title}] all declared dependencies correspond to generated subtasks`, async () => {
        const result = await issueAnalyzer(fixture as HarnessState);

        expect(result.status).not.toBe("failed");
        expect(result.status).toBe("running"); // PASS_ISSUES should always pass

        const subtasks = result.subtasks || [];
        const validTitles = new Set(subtasks.map(t => t.title));

        const hallucinatedDeps: string[] = [];
        
        for (const task of subtasks) {
          for (const dep of task.dependencies) {
            if (!validTitles.has(dep)) {
              hallucinatedDeps.push(`Task "${task.title}" depends on missing task "${dep}"`);
            }
          }
        }

        expect(
          hallucinatedDeps,
          `Hallucinated dependencies found in "${fixture.issue.title}":\n${hallucinatedDeps.join('\n')}`
        ).toHaveLength(0);
      }, 30_000);
    }
  });

  describe('Dependency graph is acyclic', () => {
    for (const fixture of PASS_ISSUES) {
      it(`[${fixture.issue.title}] the generated subtasks form a valid Directed Acyclic Graph (DAG)`, async () => {
        const result = await issueAnalyzer(fixture as HarnessState);

        expect(result.status).not.toBe("failed");
        const subtasks = result.subtasks || [];

        // Build adjacency list: node -> its dependencies
        const adjacencyList = new Map<string, string[]>();
        for (const task of subtasks) {
          // LLM might have returned duplicate deps, we strip them out via Set
          adjacencyList.set(task.title, Array.from(new Set(task.dependencies)));
        }

        const isCyclic = hasCycle(adjacencyList);

        expect(
          isCyclic,
          `Circular dependency detected in "${fixture.issue.title}". Subtasks cannot depend on each other in a loop.`
        ).toBe(false);
      }, 30_000);
    }
  });

});
