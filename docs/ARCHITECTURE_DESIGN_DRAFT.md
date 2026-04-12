# AI Engineering Harness — Architecture Design (Draft)

## Overview

An automated software development lifecycle system triggered by a ticket/issue, which plans, builds, tests, and opens a PR with minimal human intervention.

---

## SDLC Phases

- **Plan** — Understand the ticket, decompose it, confirm we have everything needed; reject if not
- **Build** — Write the actual code
- **Test** — Test, review results, adjust, repeat
- **Deploy** — Create the PR

---

## Trigger

Entry point is a ticket (e.g. GitHub Issue). An event is emitted when the issue is created; a subscriber consumes it and starts the workflow. Possible mechanisms: EDA or GitHub Actions.

---

## Agents

### Issue Analyzer
- Reads and analyzes the ticket
- Decides if it is clear and complete enough to implement
- Produces an ordered task list if it passes
- Posts a comment and exits if rejected
- Default bias: reject when in doubt (false rejection > false pass)

### Medplum Expert *(runs in parallel with Test Case Generator)*
- Deep knowledge of the Medplum platform, data types, React patterns, and hooks
- Identifies exactly which components and pieces from the repo are needed
- Provides all necessary Medplum context to the Code Generator

### Test Case Generator *(runs in parallel with Medplum Expert)*
- Generates test cases based on the spec
- Uses a different model to generate

### Code Generator
- Takes the task list and builds the code
- Generates code that works with Medplum
- Aware of existing codebase structure (knows where to place generated code)
- Retries if code fails quality check or QA tests

### Code Quality Check
- Checks ESLint and compilation errors
- Checks separation of concerns and modularity
- **On retry failure:** exits and asks human to review

### QA Agent
- Tests end-to-end
- Validates generated code against the issue's acceptance criteria
- Tests edge cases and attempts to break the code
- **On retry failure:** exits and asks human to review

### PR Generator
- Produces a PR with: description, what was built, why, approach taken, and assumptions made

---

## Exit Points

| Condition | Action |
|---|---|
| Issue rejected | Post comment on issue, stop workflow |
| Code fails quality check after retries | Exit, ask human to review |
| Code fails QA tests after retries | Exit, ask human to review |
| All checks pass | PR Generator runs → workflow complete |
