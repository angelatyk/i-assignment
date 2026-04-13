/**
 * fixtures.ts — Shared, typed test fixtures for all Vitest unit tests.
 *
 * These are HarnessState-shaped objects ready to be passed directly into agent
 * functions. They are derived from the webhook payloads in src/mocks/webhooks/
 * but stripped of GitHub-specific envelope fields.
 *
 * Usage:
 *   import { PASS_ISSUES, REJECT_ISSUES, MEDPLUM_EXPERT_STATE } from '../mocks/fixtures';
 */

import type { HarnessState } from '../state/harnessState';
import type { SourceIndexEntry, FhirSchemaIndex } from '../agents/medplumExpert/medplumExpert.types';

// ---------------------------------------------------------------------------
// Issue Analyzer fixtures
// ---------------------------------------------------------------------------

/**
 * Issues that the IssueAnalyzer is expected to PASS.
 * Each has clear acceptance criteria and does not require product-level decisions.
 */
export const PASS_ISSUES: HarnessState[] = [
  {
    // Autosave for Clinical Encounter Notes (issue #205)
    // Technical questions (debounce ms, FHIR resource) are deliberately deferred to
    // downstream agents — the IssueAnalyzer should not reject on those grounds.
    issue: {
      number: 205,
      title: 'Autosave for Clinical Encounter Notes',
      body: [
        '## Summary',
        'Clinicians are losing encounter notes when they navigate away or their session times out.',
        'We need to automatically save notes as the clinician types so that no work is lost.',
        '',
        '## User Story',
        'As a clinician, I want my encounter notes to be automatically saved as I type so that',
        'I never lose progress due to navigation or session expiry.',
        '',
        '## Acceptance Criteria',
        '- [ ] Notes are automatically saved periodically while the clinician is actively typing.',
        '- [ ] A status indicator shows one of three states: "Saving...", "Saved", or "Save failed".',
        '- [ ] The "Saving..." state is shown immediately when a save is triggered.',
        '- [ ] The "Saved" state is shown once the save is confirmed by the backend.',
        '- [ ] The "Save failed" state is shown if the backend returns an error, with a retry option.',
        '- [ ] Autosave does not trigger if the note content has not changed since the last save.',
        '- [ ] Manual Save overrides the autosave timer and saves immediately.',
        '',
        '## Technical Notes',
        '- Save frequency and debounce should be determined by engineering based on backend performance.',
        '- Notes should be persisted to the appropriate FHIR resource.',
      ].join('\n'),
      labels: ['feature', 'high-priority'],
    },
    subtasks: [],
    status: 'running',
    logs: [],
  },
  {
    // Patient Care Team Display Widget (issue #204)
    // References @medplum/react — that is a technical implementation note, not a product gap.
    issue: {
      number: 204,
      title: 'Patient Care Team Display Widget',
      body: [
        '## Summary',
        "Clinicians need to quickly identify who else is involved in a patient's care.",
        '',
        '## User Story',
        "As a clinician, I want to see who is on a patient's care team so that I can coordinate care.",
        '',
        '## Acceptance Criteria',
        "- [ ] The widget displays all active members of the patient's care team.",
        '- [ ] Each member entry shows: full name, role/specialty, and a contact method if available.',
        '- [ ] If a contact method is not available, that field is omitted gracefully.',
        '- [ ] A loading skeleton is shown while care team data is being fetched.',
        '- [ ] If the patient has no care team members, a "No care team assigned" message is displayed.',
        '- [ ] If the data fetch fails, an error message is shown with an option to retry.',
        '- [ ] The widget is read-only.',
        '',
        '## Technical Notes',
        '- Care team data should come from the relevant FHIR resources in Medplum.',
        '- Must be compatible with @medplum/react theming.',
      ].join('\n'),
      labels: ['feature', 'medplum-integration'],
    },
    subtasks: [],
    status: 'running',
    logs: [],
  },
];

/**
 * Issues that the IssueAnalyzer is expected to REJECT.
 * Each has a distinct product-level gap that cannot be resolved by a developer.
 */
export const REJECT_ISSUES: HarnessState[] = [
  {
    // Improve the Patient Dashboard (issue #201)
    // No acceptance criteria, no defined scope, relies on future design team input.
    issue: {
      number: 201,
      title: 'Improve the Patient Dashboard',
      body: [
        '## Summary',
        "Clinicians have been complaining that the patient dashboard feels cluttered and it's hard to find",
        'what they need quickly. We need to make it better and more intuitive.',
        '',
        '## User Story',
        'As a clinician, I want a cleaner and more organized patient dashboard so that I can find',
        'the information I need faster.',
        '',
        '## Notes',
        '- Look at what competitor EHR products are doing for inspiration.',
        '- It should feel modern and not overwhelming.',
        '- Prioritize the most important clinical information.',
        '- The design team will provide mockups at some point.',
      ].join('\n'),
      labels: ['enhancement'],
    },
    subtasks: [],
    status: 'running',
    logs: [],
  },
  {
    // Patient Vitals Abnormality Alert Banner (issue #202)
    // "Abnormal" is never defined — the threshold is a business rule that must be specified
    // before any developer can implement the feature.
    issue: {
      number: 202,
      title: 'Patient Vitals Abnormality Alert Banner',
      body: [
        '## Summary',
        "When a clinician opens a patient's chart, they need to be immediately alerted if the",
        "patient's most recently recorded vitals are outside the normal range.",
        '',
        '## User Story',
        "As a clinician, I want to see a prominent alert banner when a patient's vitals are abnormal",
        'so that I can prioritize assessment and act quickly.',
        '',
        '## Acceptance Criteria',
        '- [ ] A banner is displayed at the top of the patient chart when one or more vitals are abnormal.',
        '- [ ] The banner lists which specific vitals are affected.',
        '- [ ] The clinician can dismiss the banner for the current session.',
        '- [ ] The banner is not shown when all vitals are within normal range.',
        '- [ ] A loading state is displayed while vitals data is being fetched.',
        '- [ ] If vitals data cannot be loaded, an error state is shown instead of the banner.',
        '',
        '## Technical Notes',
        "- Vitals data should be sourced from the patient's Observation resources in the FHIR backend.",
      ].join('\n'),
      labels: ['feature', 'clinical-safety'],
    },
    subtasks: [],
    status: 'running',
    logs: [],
  },
  {
    // Patient Encounter History Panel (issue #203)
    // Contradictory AC: one criterion says "complete encounter history across all providers",
    // the next says "only encounters where the logged-in clinician was the primary provider".
    issue: {
      number: 203,
      title: 'Patient Encounter History Panel',
      body: [
        '## Summary',
        "Clinicians need to be able to review a patient's encounter history from within the chart.",
        '',
        '## User Story',
        "As a clinician, I want to see a patient's encounter history so that I can understand",
        'their care journey before making decisions.',
        '',
        '## Acceptance Criteria',
        "- [ ] The panel displays the patient's complete encounter history across all providers and care settings.",
        '- [ ] Only encounters where the currently logged-in clinician was the primary or attending provider are shown.',
        '- [ ] Encounters are sorted with the most recent first.',
        '- [ ] Each encounter displays: date, type, primary provider, and chief complaint.',
        '- [ ] A loading state is shown while data is fetched.',
        '- [ ] An empty state is shown if no encounters exist.',
        '',
        '## Technical Notes',
        "- Source data from the patient's Encounter FHIR resources.",
      ].join('\n'),
      labels: ['feature'],
    },
    subtasks: [],
    status: 'running',
    logs: [],
  },
];

// ---------------------------------------------------------------------------
// MedplumExpert fixtures
// ---------------------------------------------------------------------------

/**
 * A state pre-populated with subtasks, ready to be passed into the MedplumExpert agent.
 */
export const MEDPLUM_EXPERT_STATE: HarnessState = {
  issue: {
    number: 1,
    title: 'Build patient appointment scheduler',
    body: 'A UI to book appointments for patients.',
    labels: ['feature'],
  },
  subtasks: [
    {
      title: 'Create appointment booking form',
      description: 'A form that lets a user schedule a new Appointment for a Patient.',
      acceptanceCriteria: ['User can select patient', 'Form submits to FHIR server'],
      dependencies: [],
    },
  ],
  status: 'running',
  logs: [],
};

/**
 * Minimal Medplum source index entries shared across MedplumExpert tests.
 */
export const MOCK_SOURCE_INDEX: SourceIndexEntry[] = [
  {
    id: 'react/ResourceForm',
    package: 'react',
    filePath: 'packages/react/src/ResourceForm/ResourceForm.tsx',
    exportName: 'ResourceForm',
    category: 'component',
    description: 'A form for creating or editing any FHIR resource. Use for full CRUD forms.',
    importPath: '@medplum/react',
    tags: ['form', 'resource', 'CRUD'],
  },
  {
    id: 'react-hooks/useMedplum',
    package: 'react-hooks',
    filePath: 'packages/react-hooks/src/useMedplum.ts',
    exportName: 'useMedplum',
    category: 'hook',
    description: 'Returns the MedplumClient. Use for FHIR read/search/create/update.',
    importPath: '@medplum/react-hooks',
    tags: ['client', 'auth', 'data'],
  },
];

/**
 * Minimal FHIR schema index shared across MedplumExpert tests.
 */
export const MOCK_FHIR_INDEX: FhirSchemaIndex = {
  fetchedAt: '2026-01-01T00:00:00Z',
  specVersion: '1.0.5',
  schemas: {
    Patient: {
      name: 'Patient',
      description: 'Demographics and administration information about an individual.',
      properties: {
        id: { description: 'Logical id', type: 'string' },
        birthDate: { description: 'Date of birth', type: 'string' },
        gender: { description: 'Administrative gender', enum: ['male', 'female', 'other', 'unknown'] },
      },
      required: [],
    },
    Appointment: {
      name: 'Appointment',
      description: 'A booking of a healthcare event.',
      properties: {
        id: { description: 'Logical id', type: 'string' },
        status: { description: 'Appointment status', enum: ['proposed', 'booked', 'cancelled'] },
        start: { description: 'Start time', type: 'string' },
      },
      required: ['status', 'participant'],
    },
  },
};
