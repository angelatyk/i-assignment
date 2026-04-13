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
 * Fixture for a clinical note / encounter workflow.
 */
export const MEDPLUM_EXPERT_STATE_ENCOUNTER: HarnessState = {
  issue: {
    number: 2,
    title: 'Autosave for Clinical Encounter Notes',
    body: 'Clinicians are losing encounter notes when they navigate away or their session times out.',
    labels: ['feature'],
  },
  subtasks: [
    {
      title: 'Implement autosaving Encounter note form',
      description: 'A rich text form that debounces and autosaves DocumentReference and Encounter resources.',
      acceptanceCriteria: ['Saves Encounter without breaking session', 'Status indicator works'],
      dependencies: [],
    },
  ],
  status: 'running',
  logs: [],
};

/**
 * Fixture for a specialized hook/search workflow without forms.
 */
export const MEDPLUM_EXPERT_STATE_SEARCH: HarnessState = {
  issue: {
    number: 3,
    title: 'Patient Care Team Display Widget',
    body: "Clinicians need to quickly identify who else is involved in a patient's care.",
    labels: ['feature'],
  },
  subtasks: [
    {
      title: 'Build CareTeam query hook',
      description: 'Query Medplum for all active CareTeam resources related to a given Patient.',
      acceptanceCriteria: ['Returns array of members', 'Handles pagination if large list'],
      dependencies: [],
    },
  ],
  status: 'running',
  logs: [],
};

/**
 * Fixture with a vague task that shouldn't match any obvious specific form logic
 * to see how the LLM handles ambiguity.
 */
export const MEDPLUM_EXPERT_STATE_VAGUE: HarnessState = {
  issue: {
    number: 4,
    title: 'Improve Dashboard Aesthetics',
    body: 'Make the patient dashboard look nicer with more white space.',
    labels: ['enhancement'],
  },
  subtasks: [
    {
      title: 'Update generic UI container',
      description: 'Refactor the layout wrapper to add CSS padding.',
      acceptanceCriteria: ['Looks nicer'],
      dependencies: [],
    },
  ],
  status: 'running',
  logs: [],
};

/**
 * Fixture for a task with zero Medplum relevance.
 *
 * Purpose: verifies the agent returns empty source entries and schemas rather
 * than hallucinating Medplum hooks for a purely generic front-end task.
 * The expected result is 0 source entries, 0 FHIR schemas.
 */
export const MEDPLUM_EXPERT_STATE_OUT_OF_DOMAIN: HarnessState = {
  issue: {
    number: 5,
    title: 'Add Redux store for theme management',
    body: 'The app needs a global Redux slice to manage light/dark mode preferences.',
    labels: ['enhancement'],
  },
  subtasks: [
    {
      title: 'Create theme Redux slice',
      description:
        'Add a Redux Toolkit slice that stores the current theme (light | dark) in global state. ' +
        'Expose a toggleTheme action. No FHIR data is involved.',
      acceptanceCriteria: [
        'Slice is registered in the root Redux store',
        'toggleTheme action flips state correctly',
        'No Medplum hooks are used',
      ],
      dependencies: [],
    },
  ],
  status: 'running',
  logs: [],
};

/**
 * Fixture that specifically exercises the ResourceForm component path.
 *
 * Purpose: `react/ResourceForm` was returned as an unrecognized ID in two of the
 * original integration runs and was silently dropped. This fixture targets a task
 * where ResourceForm is the natural answer, so we can assert on whether it is
 * correctly resolved or consistently flagged as unrecognized.
 */
export const MEDPLUM_EXPERT_STATE_RESOURCE_FORM: HarnessState = {
  issue: {
    number: 6,
    title: 'Generic FHIR Resource Editor',
    body: 'Allow admin users to edit any FHIR resource directly via a schema-driven form.',
    labels: ['feature', 'admin'],
  },
  subtasks: [
    {
      title: 'Build schema-driven resource edit form',
      description:
        'Render a ResourceForm for an arbitrary FHIR resource type passed in as a prop. ' +
        'The form should use the Medplum ResourceForm component and submit via useMedplum.',
      acceptanceCriteria: [
        'Form renders fields derived from the FHIR schema',
        'Submit calls medplum.updateResource',
        'Validation errors are displayed inline',
      ],
      dependencies: [],
    },
  ],
  status: 'running',
  logs: [],
};

/**
 * Fixture with multiple subtasks covering different Medplum surface areas.
 *
 * Purpose: all previous fixtures have exactly one subtask. This fixture checks
 * that the agent correctly aggregates context across several tasks in a single
 * pass rather than only processing the first subtask.
 *
 * Expected: source entries should span hooks (useMedplum, useSearchResources),
 * display components (ResourceTable), and input components (ReferenceInput).
 * FHIR schemas should include at least Patient, Observation, and DiagnosticReport.
 */
export const MEDPLUM_EXPERT_STATE_MULTI_SUBTASK: HarnessState = {
  issue: {
    number: 7,
    title: 'Patient Lab Results Panel',
    body: 'A panel that queries, displays, and allows filtering of a patient\'s lab results.',
    labels: ['feature'],
  },
  subtasks: [
    {
      title: 'Query DiagnosticReport resources',
      description:
        'Fetch all DiagnosticReport resources for a given Patient from Medplum, ' +
        'sorted by date descending. Handle loading and error states.',
      acceptanceCriteria: ['Returns sorted list', 'Loading spinner shown during fetch'],
      dependencies: [],
    },
    {
      title: 'Render results in a resource table',
      description:
        'Display the fetched DiagnosticReport resources using a Medplum ResourceTable component. ' +
        'Columns: date, code, status, performer.',
      acceptanceCriteria: ['Table renders all columns', 'Empty state shown when no results'],
      dependencies: ['Query DiagnosticReport resources'],
    },
    {
      title: 'Add patient filter input',
      description:
        'Allow the user to switch the viewed patient by selecting from a ReferenceInput ' +
        'scoped to Patient resources.',
      acceptanceCriteria: ['Selecting a new patient re-fetches results', 'Input is searchable'],
      dependencies: [],
    },
  ],
  status: 'running',
  logs: [],
};

/**
 * Export all fixtures together for the integration runner.
 *
 * ORDER MATTERS for log readability:
 *   1–4  original fixtures (regression baseline)
 *   5    out-of-domain (expect zero selections)
 *   6    ResourceForm edge case (unrecognized ID regression)
 *   7    multi-subtask (aggregation correctness)
 */
export const MEDPLUM_EXPERT_FIXTURES = [
  MEDPLUM_EXPERT_STATE,
  MEDPLUM_EXPERT_STATE_ENCOUNTER,
  MEDPLUM_EXPERT_STATE_SEARCH,
  MEDPLUM_EXPERT_STATE_VAGUE,
  MEDPLUM_EXPERT_STATE_OUT_OF_DOMAIN,
  MEDPLUM_EXPERT_STATE_RESOURCE_FORM,
  MEDPLUM_EXPERT_STATE_MULTI_SUBTASK,
];

// ---------------------------------------------------------------------------
// Shared mock indexes for unit tests
// ---------------------------------------------------------------------------

/**
 * Expanded source index covering hooks, display components, and input components.
 *
 * Previously only contained hooks. The additions ensure unit tests that assert
 * on component-type selection are not trivially satisfied by an empty pool.
 */
export const MOCK_SOURCE_INDEX: SourceIndexEntry[] = [
  // --- Forms & CRUD ---
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
  // --- Hooks ---
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
  {
    id: 'react-hooks/useMedplumContext',
    package: 'react-hooks',
    filePath: 'packages/react-hooks/src/useMedplumContext.ts',
    exportName: 'useMedplumContext',
    category: 'hook',
    description: 'Returns the full Medplum context including profile and auth state.',
    importPath: '@medplum/react-hooks',
    tags: ['context', 'auth', 'profile'],
  },
  {
    id: 'react-hooks/useMedplumProfile',
    package: 'react-hooks',
    filePath: 'packages/react-hooks/src/useMedplumProfile.ts',
    exportName: 'useMedplumProfile',
    category: 'hook',
    description: 'Returns the current user profile resource (Practitioner, Patient, etc.).',
    importPath: '@medplum/react-hooks',
    tags: ['profile', 'auth', 'user'],
  },
  {
    id: 'react-hooks/useSearchResources',
    package: 'react-hooks',
    filePath: 'packages/react-hooks/src/useSearchResources.ts',
    exportName: 'useSearchResources',
    category: 'hook',
    description: 'Reactive hook that searches for FHIR resources and returns a flat array.',
    importPath: '@medplum/react-hooks',
    tags: ['search', 'query', 'list'],
  },
  // --- Display components ---
  {
    id: 'react/ResourceTable',
    package: 'react',
    filePath: 'packages/react/src/ResourceTable/ResourceTable.tsx',
    exportName: 'ResourceTable',
    category: 'component',
    description: 'Renders a paginated table of FHIR resources with configurable columns.',
    importPath: '@medplum/react',
    tags: ['table', 'list', 'display', 'pagination'],
  },
  {
    id: 'react/Timeline',
    package: 'react',
    filePath: 'packages/react/src/Timeline/Timeline.tsx',
    exportName: 'Timeline',
    category: 'component',
    description: 'Displays a chronological list of FHIR resources as a timeline.',
    importPath: '@medplum/react',
    tags: ['timeline', 'history', 'display'],
  },
  // --- Input components ---
  {
    id: 'react/ReferenceInput',
    package: 'react',
    filePath: 'packages/react/src/ReferenceInput/ReferenceInput.tsx',
    exportName: 'ReferenceInput',
    category: 'component',
    description: 'Search-as-you-type input for selecting a FHIR Reference.',
    importPath: '@medplum/react',
    tags: ['input', 'reference', 'search', 'select'],
  },
  {
    id: 'react/CalendarInput',
    package: 'react',
    filePath: 'packages/react/src/CalendarInput/CalendarInput.tsx',
    exportName: 'CalendarInput',
    category: 'component',
    description: 'Calendar date picker for selecting appointment or event dates.',
    importPath: '@medplum/react',
    tags: ['input', 'date', 'calendar', 'appointment'],
  },
  {
    id: 'react/DateTimeInput',
    package: 'react',
    filePath: 'packages/react/src/DateTimeInput/DateTimeInput.tsx',
    exportName: 'DateTimeInput',
    category: 'component',
    description: 'Combined date and time picker for FHIR dateTime fields.',
    importPath: '@medplum/react',
    tags: ['input', 'date', 'time', 'datetime'],
  },
  // --- Layout ---
  {
    id: 'react/Container',
    package: 'react',
    filePath: 'packages/react/src/Container/Container.tsx',
    exportName: 'Container',
    category: 'component',
    description: 'Centers and constrains content width. Use for top-level page layout.',
    importPath: '@medplum/react',
    tags: ['layout', 'container', 'wrapper'],
  },
];

/**
 * Expanded FHIR schema index covering a wider set of resource types.
 *
 * Previously only contained Patient and Appointment. The additions ensure unit
 * tests for search, encounter, and lab-result workflows have realistic schemas
 * available to assert against.
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
    Encounter: {
      name: 'Encounter',
      description: 'An interaction between a patient and healthcare provider.',
      properties: {
        id: { description: 'Logical id', type: 'string' },
        status: { description: 'Encounter status', enum: ['planned', 'in-progress', 'finished', 'cancelled'] },
        subject: { description: 'The patient', type: 'Reference' },
        participant: { description: 'List of participants', type: 'array' },
      },
      required: ['status'],
    },
    DocumentReference: {
      name: 'DocumentReference',
      description: 'A reference to a clinical document.',
      properties: {
        id: { description: 'Logical id', type: 'string' },
        status: { description: 'Document status', enum: ['current', 'superseded', 'entered-in-error'] },
        content: { description: 'Document content with attachment', type: 'array' },
        context: { description: 'Clinical context (encounter reference)', type: 'object' },
        author: { description: 'Who authored the document', type: 'array' },
      },
      required: ['status', 'content'],
    },
    CareTeam: {
      name: 'CareTeam',
      description: 'A group of practitioners and/or organizations caring for a patient.',
      properties: {
        id: { description: 'Logical id', type: 'string' },
        status: { description: 'CareTeam status', enum: ['proposed', 'active', 'suspended', 'inactive'] },
        subject: { description: 'The patient this care team is for', type: 'Reference' },
        participant: { description: 'Members of the care team', type: 'array' },
      },
      required: ['status'],
    },
    DiagnosticReport: {
      name: 'DiagnosticReport',
      description: 'The findings and interpretation of diagnostic tests.',
      properties: {
        id: { description: 'Logical id', type: 'string' },
        status: { description: 'Report status', enum: ['registered', 'partial', 'final', 'amended'] },
        code: { description: 'Name/code for this diagnostic report', type: 'CodeableConcept' },
        subject: { description: 'The patient', type: 'Reference' },
        effectiveDateTime: { description: 'Clinically relevant time of report', type: 'string' },
        performer: { description: 'Responsible party', type: 'array' },
      },
      required: ['status', 'code'],
    },
    Observation: {
      name: 'Observation',
      description: 'Measurements and simple assertions about a patient.',
      properties: {
        id: { description: 'Logical id', type: 'string' },
        status: { description: 'Observation status', enum: ['registered', 'preliminary', 'final', 'amended'] },
        code: { description: 'Type of observation', type: 'CodeableConcept' },
        subject: { description: 'Who the observation is about', type: 'Reference' },
        valueQuantity: { description: 'Numeric result value with units', type: 'object' },
      },
      required: ['status', 'code'],
    },
  },
};