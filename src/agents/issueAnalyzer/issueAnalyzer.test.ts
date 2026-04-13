/**
 * issueAnalyzer.test.ts — Unit tests for the IssueAnalyzer agent.
 *
 * All LLM calls are mocked via vi.mock. No API key required.
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HarnessState } from '../../state/harnessState';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that use them.
// Vitest hoists vi.mock() calls automatically.
// ---------------------------------------------------------------------------

vi.mock('../../utils/llmFactory', () => ({
  getModel: vi.fn(),
}));

// Import after mocks are declared
import { issueAnalyzer } from './issueAnalyzer';
import { getModel } from '../../utils/llmFactory';
import { PASS_ISSUES, REJECT_ISSUES } from '../../mocks/fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock LLM that returns a structured pass response.
 */
function makeMockLlmPass() {
  const invoke = vi.fn().mockResolvedValue({
    decision: 'pass',
    reasoning: 'Issue has clear acceptance criteria and no product-level gaps.',
    subtasks: [
      {
        title: 'Implement the feature component',
        description: 'Build the React component described in the issue.',
        acceptanceCriteria: ['Component renders correctly', 'Error state is handled'],
        dependencies: [],
      },
    ],
  });
  return { withStructuredOutput: vi.fn().mockReturnValue({ invoke }) };
}

/**
 * Build a mock LLM that returns a structured reject response.
 */
function makeMockLlmReject() {
  const invoke = vi.fn().mockResolvedValue({
    decision: 'reject',
    reasoning: 'Issue lacks measurable acceptance criteria.',
    comment: 'This issue needs clearer acceptance criteria before it can be implemented.',
  });
  return { withStructuredOutput: vi.fn().mockReturnValue({ invoke }) };
}

/**
 * Build a mock LLM that throws on invoke.
 */
function makeMockLlmThrows() {
  const invoke = vi.fn().mockRejectedValue(new Error('API rate limit exceeded'));
  return { withStructuredOutput: vi.fn().mockReturnValue({ invoke }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('issueAnalyzer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // --- Happy path: pass ---

  it('returns status:running and a subtask list on a pass decision', async () => {
    vi.mocked(getModel).mockReturnValue(makeMockLlmPass() as unknown as ReturnType<typeof getModel>);

    const result = await issueAnalyzer(PASS_ISSUES[0]);

    expect(result.status).toBe('running');
    expect(result.subtasks).toHaveLength(1);
    expect(result.subtasks![0].title).toBe('Implement the feature component');
    expect(result.subtasks![0].acceptanceCriteria).toContain('Component renders correctly');
    expect(result.rejectionReason).toBeUndefined();
  });

  it('appends a success log entry on a pass decision', async () => {
    vi.mocked(getModel).mockReturnValue(makeMockLlmPass() as unknown as ReturnType<typeof getModel>);

    const result = await issueAnalyzer(PASS_ISSUES[0]);

    const logs = result.logs ?? [];
    expect(logs).toHaveLength(1);
    expect(logs[0].agentName).toBe('IssueAnalyzer');
    expect(logs[0].status).toBe('success');
    expect(logs[0].decision).toContain('Passed');
  });

  // --- Happy path: reject ---

  it('returns status:needs_clarification and a rejectionReason on a reject decision', async () => {
    vi.mocked(getModel).mockReturnValue(makeMockLlmReject() as unknown as ReturnType<typeof getModel>);

    const result = await issueAnalyzer(REJECT_ISSUES[0]);

    expect(result.status).toBe('needs_clarification');
    expect(typeof result.rejectionReason).toBe('string');
    expect(result.rejectionReason!.length).toBeGreaterThan(0);
    expect(result.subtasks).toBeUndefined();
  });

  it('appends a success log entry on a reject decision', async () => {
    vi.mocked(getModel).mockReturnValue(makeMockLlmReject() as unknown as ReturnType<typeof getModel>);

    const result = await issueAnalyzer(REJECT_ISSUES[0]);

    const logs = result.logs ?? [];
    expect(logs).toHaveLength(1);
    expect(logs[0].agentName).toBe('IssueAnalyzer');
    expect(logs[0].status).toBe('success');
    expect(logs[0].decision).toContain('Rejected');
  });

  // --- Error handling ---

  it('returns status:failed and a failure log when the LLM call throws', async () => {
    vi.mocked(getModel).mockReturnValue(makeMockLlmThrows() as unknown as ReturnType<typeof getModel>);

    const result = await issueAnalyzer(PASS_ISSUES[0]);

    expect(result.status).toBe('failed');
    const logs = result.logs ?? [];
    expect(logs).toHaveLength(1);
    expect(logs[0].agentName).toBe('IssueAnalyzer');
    expect(logs[0].status).toBe('failure');
  });

  // --- Immutability ---

  it('does not mutate the incoming state.logs array', async () => {
    vi.mocked(getModel).mockReturnValue(makeMockLlmPass() as unknown as ReturnType<typeof getModel>);

    const state: HarnessState = { ...PASS_ISSUES[0], logs: [] };
    const originalLength = state.logs.length;

    await issueAnalyzer(state);

    expect(state.logs.length).toBe(originalLength);
  });

  // --- Edge cases ---

  it('handles an issue with no labels without throwing', async () => {
    vi.mocked(getModel).mockReturnValue(makeMockLlmPass() as unknown as ReturnType<typeof getModel>);

    const state: HarnessState = {
      ...PASS_ISSUES[0],
      issue: { ...PASS_ISSUES[0].issue, labels: [] },
    };

    await expect(issueAnalyzer(state)).resolves.not.toThrow();
  });

  it('handles an issue with an empty body without throwing', async () => {
    vi.mocked(getModel).mockReturnValue(makeMockLlmPass() as unknown as ReturnType<typeof getModel>);

    const state: HarnessState = {
      ...PASS_ISSUES[0],
      issue: { ...PASS_ISSUES[0].issue, body: '' },
    };

    await expect(issueAnalyzer(state)).resolves.not.toThrow();
  });
});
