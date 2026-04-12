## Plan Before Code - Non-Negotiable

**Before writing any code, you must produce an implementation plan and wait for explicit approval.**

The plan should include:

- What you are about to build and why
- Which files you will create, modify, or delete (listed explicitly)
- Any assumptions you are making
- Any risks or tradeoffs worth flagging before starting

**Do not proceed until the user responds with "approved", "go ahead", "looks good", or equivalent.**

If something is unclear, ask. Do not assume.

---

## Project Overview

This is an AI engineering harness. It is a multi-agent system that takes a GitHub issue and delivers a tested pull request without a human writing implementation code.

This repository is the **harness itself**, not a feature application. You are building the machinery, not the features the machinery delivers.

**Tech Stack:**

- Language: TypeScript (strict mode)
- Orchestration: LangGraph (`@langchain/langgraph`)
- Testing: Vitest
- Linting: ESLint
- Package manager: npm

---

## Coding Standards

**TypeScript**

- Use strict mode always: no `any`, no implicit returns, no unchecked nulls
- Provide explicit parameter and return types on all functions
- Use interfaces over types for object shapes
- Use named exports over default exports

**Separation of Concerns**

- Give each agent one responsibility: no agent should read a ticket, generate code, and update state in a single function
- Place shared logic in /utils, never duplicate it across agents
- Perform state mutations only via the return value of a node function: do not mutate state directly

**Modularity**

- Place one agent per file: do not split an agent across files or merge two agents into one
- Place helper functions used by more than one agent in /utils

**Naming**

- Agent functions: camelCase matching the filename (issueAnalyzer, codeGenerator)
- Interfaces: PascalCase (HarnessState, GitHubIssue)
- Constants: UPPER_SNAKE_CASE
- Files: camelCase.ts

**Error Handling**

- Wrap all LLM calls in try/catch
- Wrap all JSON.parse calls in try/catch: LLMs can return malformed JSON
- Write meaningful error messages that include which agent failed and why

**Logging**

- Have every agent add a LogEntry to state.log
- Use console.log with the agent name prefix: [AgentName] message
- Log decisions, not just completions

---

## Environment and Secrets

- Keep all API keys in `.env`: do not hardcode them
- Keep `.env` gitignored: use `.env.example` to document required keys
- If you need a new environment variable, add it to `.env.example` with an empty value and a comment explaining what it is

---

## Dependencies

- Do not install a new npm package without flagging it first
- Include the package name, purpose, and why an existing dependency does not cover the need
- Do not proceed with installation until the user explicitly approves

---

## Testing

- Place tests alongside their source file: `agent-name.test.ts` next to `agent-name.ts`
- Give every agent at least one test that mocks the LLM call and validates the output shape
- Do not write tests that only verify implementation details: test behavior and output contracts

---

## Git Hygiene

- Do not commit or push anything unless explicitly asked
- When asked to commit, use conventional commit format:
  feat: description
  fix: description
  chore: description
- Make one logical change per commit: do not batch unrelated changes

---

## Handling Ambiguity

- If a requirement is ambiguous, ask before assuming
- If you are about to make a decision that affects the architecture (new file location, new dependency, changing an agent's responsibility), stop and flag it
- If something in this file contradicts what you have been asked to do in the current task, flag the contradiction: do not silently pick one

---

## Scope

- You are here to build the harness, not to use it
- Do not generate application features, sample implementations, or example outputs unless explicitly asked
- If a task feels like it belongs to the product the harness will build rather than the harness itself, flag it before proceeding
