import { LogEntry } from '../state/harnessState';

/**
 * Constructs a LogEntry for the harness state log.
 * Shared across all agents — do not duplicate this in individual agent files.
 *
 * @param agentName - The name of the agent emitting this log (e.g. 'IssueAnalyzer')
 * @param decision  - A human-readable description of the decision or outcome
 * @param status    - Whether this log represents a success or failure
 */
export function buildLog(
  agentName: string,
  decision: string,
  status: LogEntry['status'],
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    agentName,
    decision,
    status,
  };
}
