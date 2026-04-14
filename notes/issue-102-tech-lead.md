# Issue #102: MED-452: Implement FHIR-compliant Drug Interaction Checker Component

**Author:** Tech Lead (`tech-lead-user`)

## Summary

Implement a reusable React component for the Medplum workspace that orchestrates safety checks for new medications. The component serves as the integration point between the patient's existing clinical record and an external clinical decision support (CDS) service, surfacing risks before a prescription is finalized.

## User Story

As a platform engineer, I need a robust, domain-aware safety component so that clinical applications built on Medplum can ensure FHIR-compliant drug safety checks are performed at the point of care.

## Acceptance Criteria

- [ ] **Data Orchestration:** Component retrieves the active `Patient` context, including all active `MedicationRequest` and `AllergyIntolerance` resources.
- [ ] **Interface Abstraction:** Implement a clean interface/gate for the external Drug Interaction API to allow for easy swapping between mock and production providers.
- [ ] **State Management:** Accurately render transitions between `Idle`, `Loading`, `Success` (with result variants), and `Error` states.
- [ ] **Severity Mapping:** Map external service responses to FHIR-aligned severity levels (Critical, Warning, Minor).
- [ ] **Persistence:** Successfully record interaction findings back to the Medplum server as FHIR resources (e.g., `DetectedIssue` or `Observation`).
- [ ] **Context Awareness:** The component must reactively update if the patient’s clinical record changes during the session.

## Domain Context

- The interaction logic is external; this ticket focuses on the **API Gateway** pattern on the Medplum side to encapsulate those calls.
- Results must consider demographic data (Age/Sex) from the `Patient` resource to identify contraindications.

## Out of Scope

- Building the pharmacology/logic engine (third-party API handles this).
- UI for modifying existing patient medications or allergies.

## Technical Notes

- **Component Library:** Utilize `@medplum/react` hooks (e.g., `useMedplum`, `useResource`) for data fetching and consistent styling.
- **API Strategy:** Define a clear abstraction layer for the "Drug Interaction Gate." This should be an interface that can be fulfilled by a `MockInteractionService` for testing.
- **Resource Linking:** When saving results, ensure appropriate `reference` links are established between the new `MedicationRequest` and the resulting safety resource.
- **Performance:** Debounce or memoize calls to the external service to prevent unnecessary overhead during rapid clinical entry.
