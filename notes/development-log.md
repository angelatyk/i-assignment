## Development Log

## System Design

- assignment review
- Medplum research
- initial harness architecture planning

- rough estimation of time used: 40 minutes

## Issue Analyzer

- talked about what makes a good issue for the AI to work on
- talked about a good issue structure
- created mock issues from both non-technical (BA) and technical (tech lead) perspectives
- made it possible to switch between different AI models for the agent

- challenges:
  - the agent worked but it was rejecting issues that were perfectly fine, it was too strict
  - dug into why: it was treating technical gaps as product gaps, flagging things like "which FHIR resource type to use" as rejection reasons, even though that's exactly what the downstream Medplum expert agent is for
  - fixed the prompt in two ways: added a classification step forcing the agent to ask "is this a product gap or a technical gap?" before deciding, and added concrete examples of what each looks like in a clinical/FHIR context
  - both original issues now passed, but then couldn't tell if the bar had swung too far the other way, needed negative test cases
  - created 5 more mock issues: 3 intentionally bad (no AC, missing business rule, contradictory AC) and 2 intentionally good with technical ambiguity that should pass through
  - ran all 7 tests, all 7 came back with the right decision, including the tricky vitals one that looked well-written but had an undefined business rule ("abnormal" was never defined)

- refactor:
  - enhanced Issue Analyzer with structured output and decoupled prompts
  - introduced Zod for type-safe LLM responses
  - extracted system instructions to a dedicated prompt file
  - added batched concurrency to the test suite

- rough estimation of time used: 40 minutes

## Medplum Expert

- considered several approaches to get the Medplum context into the LLM
  - direct github exposure
  - repo map
  - RAG
  - Custom MCP + RAG
- discovered https://api.medplum.com/openapi.json which contains all the FHIR resource schemas
- decided to use a two-pass approach:
  1. filter the source index down to relevant entries
  2. filter the FHIR schemas down to relevant resources

- created a script to build the source index from the Medplum repo
- created a script to build the FHIR schemas from the Medplum OpenAPI spec
- created a script to build the Medplum context document
- created a script to test the Medplum expert agent

- challenges:
  - signature extraction was too simplistic at first, was just crawling files and missing most of the public API because Medplum hides everything behind barrel exports (index.ts)
  - had to rewrite the scraper to be barrel-aware: it now parses the index files first, resolves the internal re-exports, and then extracts signatures from the actual source files
  - batched the script: files are now grouped into batches of 8 using withStructuredOutput to get precise developer-focused descriptions much faster

- rough estimation of time used: 90 minutes

## Manual Code Review

- refactored codebase to use a more modular and maintainable structure
- added more complete test coverage

- rough estimation of time used: 30 minutes

## LangGraph - Multi-agent orchestration

- created a graph that orchestrates the issue analyzer and medplum expert agents
- added conditional edges to route between agents based on the issue analyzer's decision
- added a test suite to verify the graph's behavior

- rough estimation of time used: 10 minutes

## Wrapping up rough 3.5 hours session

- added README.md
- added pusedocode for remaining agents
