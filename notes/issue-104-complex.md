# Issue #104: Patient Lab Results Panel
**Author:** Senior Engineer (`senior-engineer-user`)

## Summary
We need a comprehensive panel that queries, displays, and allows filtering of a patient's lab results within the main charting view. This is a multi-step feature that requires data fetching, tabular rendering, and interactive filtering.

## User Story
As a clinician, I want to view a sortable table of all lab findings for a selected patient so that I can track their diagnostic history and make informed decisions.

## Acceptance Criteria
- [ ] The component must query `DiagnosticReport` resources from the FHIR backend for the active patient.
- [ ] Results must be displayed in a table showing the date, test code, status, and performer.
- [ ] The table must show an empty state if no results exist.
- [ ] A loading spinner must be displayed while the query is in flight.
- [ ] The user must be able to change the viewed patient using a ReferenceInput search field, which triggers a re-fetch of the table.
- [ ] Any errors from the FHIR query must be displayed to the user cleanly.

## Technical Notes
- Use Medplum React components wherever possible (e.g., `ResourceTable`, `ReferenceInput`).
- The component must be built defensively assuming the FHIR server may have delays.
