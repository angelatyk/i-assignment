## Development Log

## Issue Analyzer

- talked about what makes a good issue for the AI to work on
- talked about a good issue structure
- created mock issues from both non-technical (BA) and technical (tech lead) perspectives
- made it possible to switch between different AI models for the agent

- challenges:
  - the agent worked but it was rejecting issues that were perfectly fine — it was too strict
  - dug into why: it was treating technical gaps as product gaps, flagging things like "which FHIR resource type to use" as rejection reasons, even though that's exactly what the downstream Medplum expert agent is for
  - fixed the prompt in two ways: added a classification step forcing the agent to ask "is this a product gap or a technical gap?" before deciding, and added concrete examples of what each looks like in a clinical/FHIR context
  - both original issues now passed, but then couldn't tell if the bar had swung too far the other way — needed negative test cases
  - created 5 more mock issues: 3 intentionally bad (no AC, missing business rule, contradictory AC) and 2 intentionally good with technical ambiguity that should pass through
  - ran all 7 tests — all 7 came back with the right decision, including the tricky vitals one that looked well-written but had an undefined business rule ("abnormal" was never defined)
