import { describe, it, expect, vi, beforeEach } from 'vitest';
import { harnessGraph } from './graph';
import { HarnessState } from '../state/harnessState';
import { issueAnalyzer } from '../agents/issueAnalyzer/issueAnalyzer';
import { medplumExpert } from '../agents/medplumExpert/medplumExpert';

// Mock the agents
vi.mock('../agents/issueAnalyzer/issueAnalyzer', () => ({
  issueAnalyzer: vi.fn(),
}));

vi.mock('../agents/medplumExpert/medplumExpert', () => ({
  medplumExpert: vi.fn(),
}));

describe('harnessGraph', () => {
  let baseState: HarnessState;

  beforeEach(() => {
    vi.clearAllMocks();
    baseState = {
      issue: { number: 1, title: 'Test Issue', body: 'Test body', labels: [] },
      subtasks: [],
      status: 'running',
      logs: [],
    };
  });

  it('routes to medplumExpert when issue analyzer passes (status = "running")', async () => {
    vi.mocked(issueAnalyzer).mockImplementation(async (state) => ({
      status: 'running',
      subtasks: [{ title: 'Task 1', description: 'desc', acceptanceCriteria: [], dependencies: [] }],
      logs: [...state.logs, { timestamp: 't1', agentName: 'IssueAnalyzer', decision: 'Pass', status: 'success' }],
    }));

    vi.mocked(medplumExpert).mockImplementation(async (state) => ({
      medplumContext: {
        selectedSourceEntries: [],
        fullSourceSnippets: {},
        selectedFhirSchemas: {},
        summary: 'Expert summarized',
      },
      logs: [...state.logs, { timestamp: 't2', agentName: 'MedplumExpert', decision: 'Pass', status: 'success' }],
    }));

    const finalState = await harnessGraph.invoke(baseState);

    expect(issueAnalyzer).toHaveBeenCalledOnce();
    expect(medplumExpert).toHaveBeenCalledOnce();
    expect(finalState.status).toBe('running');
    expect(finalState.subtasks.length).toBe(1);
    expect(finalState.medplumContext).toBeDefined();
    expect(finalState.logs.length).toBe(2);
    expect(finalState.logs[0].agentName).toBe('IssueAnalyzer');
    expect(finalState.logs[1].agentName).toBe('MedplumExpert');
  });

  it('routes to END when issue analyzer rejects (status = "needs_clarification")', async () => {
    vi.mocked(issueAnalyzer).mockResolvedValueOnce({
      status: 'needs_clarification',
      rejectionReason: 'Not enough details',
      logs: [{ timestamp: 't1', agentName: 'IssueAnalyzer', decision: 'Reject', status: 'success' }],
    });

    const finalState = await harnessGraph.invoke(baseState);

    expect(issueAnalyzer).toHaveBeenCalledOnce();
    expect(medplumExpert).not.toHaveBeenCalled();
    expect(finalState.status).toBe('needs_clarification');
    expect(finalState.rejectionReason).toBe('Not enough details');
  });

  it('routes to END when issue analyzer fails (status = "failed")', async () => {
    vi.mocked(issueAnalyzer).mockResolvedValueOnce({
      status: 'failed',
      logs: [{ timestamp: 't1', agentName: 'IssueAnalyzer', decision: 'Error', status: 'failure' }],
    });

    const finalState = await harnessGraph.invoke(baseState);

    expect(issueAnalyzer).toHaveBeenCalledOnce();
    expect(medplumExpert).not.toHaveBeenCalled();
    expect(finalState.status).toBe('failed');
  });
});
