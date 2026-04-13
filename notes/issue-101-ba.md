# Issue #101: Prescription Safety: Drug Interaction Checker
**Author:** Business Analyst (`business-analyst-user`)

## Summary
We need a way for clinicians to quickly verify if a new medication they are prescribing will have dangerous interactions with a patient's current medications or known allergies. This is a critical safety feature to prevent adverse drug events.

## User Story
As a clinician, I want to be automatically alerted to potential drug-drug or drug-allergy interactions when I prescribe a new medication, so that I can ensure patient safety and avoid harmful complications.

## Acceptance Criteria
- [ ] The system checks for interactions against the patient's active medication list.
- [ ] The system checks for interactions against the patient's documented allergies.
- [ ] Alerts must be categorized by severity (Critical, Warning, Minor).
- [ ] The system must account for patient age and sex in interaction logic.
- [ ] If no interactions are found, a clear "No interactions found" message is displayed.
- [ ] A loading state is shown while the safety check is in progress.
- [ ] If the check fails (e.g., service unavailable), a clear error message is shown to the clinician.

## Domain Context
- Critical interactions are life-threatening and must be high-visibility.
- The clinician's existing workflow should be interrupted as little as possible unless a Critical or Warning interaction is found.

## Out of Scope
- Manually adding medications to the patient's record from this screen.
- Finalizing the prescription order (this component only does the check).

## Technical Notes
- The UI should be responsive and provide immediate visual feedback.
- Error states must be handled gracefully so the clinician can still proceed if they choose to override (standard medical bypass).
