# Issue #102: MED-452: Implement FHIR-compliant Drug Interaction Checker Component
**Author:** Tech Lead (`tech-lead-user`)

## Summary
Implement a reusable React component for the Medplum Workbench that performs safety checks on new medications. The component must interface with the FHIR backend to identify contraindications before clinicians finalize a prescription.

## User Story
As a platform engineer, I need a robust, domain-aware safety component so that clinical applications built on Medplum can ensure FHIR-compliant drug safety checks are performed at the point of care.

## Acceptance Criteria
- [ ] Component consumes a proposed `MedicationRequest` and validates against active `MedicationRequest` and `AllergyIntolerance` resources.
- [ ] Must handle asynchronous loading states of the Medplum API.
- [ ] UI must accurately render four distinct states: No Interactions, Minor Warnings, Critical Warnings, and API Error (500/404).
- [ ] Logic must filter by patient demographic data (age, sex) retrieved from the `Patient` resource.
- [ ] Interaction results should be storable as a FHIR `Observation` or `Linkage` for audit purposes.
- [ ] The component must be reactive to changes in the patient's record context within the Workbench.

## Domain Context
- We are using a third-party interaction service via a FHIR-bridge. 
- All interactions must be weighted by clinical severity data provided by the upstream FHIR server.

## Out of Scope
- Implementing the actual medication bridge service (this issue is for the frontend component and orchestration).
- Support for non-FHIR data sources.

## Technical Notes
- Ensure compatibility with Medplum's `@medplum/react` components and themes.
- Interaction checks should be debounced if triggered by rapid input.
- Error handling must distinguish between "No results found" (200 OK) and "Service Unavailable" (503).
