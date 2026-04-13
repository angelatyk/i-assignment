# AI Engineering Harness

An AI engineering harness built to automate the Software Development Life Cycle (SDLC). This project is a multi-agent orchestration system that takes a GitHub issue and autonomously delivers a tested pull request containing implementation code—without human intervention.

Currently, the machinery is designed to integrate deeply with the [Medplum SDK](https://www.medplum.com/) and FHIR standards.

## Architecture & Pipeline

The harness is built around a stateful agent graph powered by [LangGraph](https://github.com/langchain-ai/langgraphjs). The system is designed as a multi-stage pipeline where specialized agents progressively build the `HarnessState`.

1. **Plan Phase**: Validate requirements and gather domain context.
2. **Build Phase**: Generate implementation code and tests.
3. **Test Phase**: Verify code against requirements and quality standards.
4. **Deploy Phase**: Open a pull request for human review.

### Specialized Agents

#### 🟢 Developed

- **Issue Analyzer (`src/agents/issueAnalyzer`)**: The gatekeeper. It reviews incoming GitHub issues for "product clarity". It either decomposes the issue into actionable subtasks or rejects it with a request for clarification.
- **Medplum Expert (`src/agents/medplumExpert`)**: Provides domain-specific context for Medplum/FHIR. It indexes the SDK and OpenAPI schemas to select exactly the components and resource types needed for a task.

#### 🏗️ Planned / Future

- **Test Case Generator**: Will autonomously generate Vitest test cases based on the issue's acceptance criteria before code is written.
- **Code Generator**: Will consume the task list and Medplum context to author the implementation code.
- **Code Quality Check**: An automated "Linter Agent" that ensures the generated code meets ESLint standards and modularity requirements.
- **QA Agent**: An agent dedicated to running end-to-end tests and validating that the output actually solves the user's problem.
- **PR Generator**: The final stage that assembles the technical documentation and opens the GitHub Pull Request.

## Tech Stack

- **Language**: TypeScript (Strict Mode)
- **Orchestration**: LangGraph (`@langchain/langgraph`)
- **LLM Integration**: LangChain (`@langchain/core`)
- **Validation**: Zod
- **Testing**: Vitest
- **Environment**: Node.js

## Project Structure

```text
src/
├── agents/             # Modular agent definitions and unit tests
│   ├── issueAnalyzer/      # [🟢 Developed] Requirements reviewer
│   ├── medplumExpert/       # [🟢 Developed] Domain context expert
│   ├── testCaseGenerator/  # [🏗️ Planned] Test case builder
│   ├── codeGenerator/      # [🏗️ Planned] Implementation logic
│   ├── codeQualityCheck/   # [🏗️ Planned] Linter & pattern enforcer
│   ├── qaAgent/            # [🏗️ Planned] E2E validator
│   └── prGenerator/    # [🏗️ Planned] PR documentation author
├── context/            # Generated indexing and tooling for agents
├── graph/              # LangGraph definitions and conditional routing
├── prompts/            # Centralized system prompts for LLMs
├── scripts/            # Build and utility scripts
├── state/              # Shared HarnessState definition and LangGraph annotations
└── utils/              # Shared helper functions (e.g. LLM Factory)
```

## Documentation

- **[notes/development-log.md](notes/development-log.md)**: A changelog capturing key milestones, challenges, and iterative decisions made during development.
- **[notes/notes.md](notes/notes.md)**: Raw technical notes, thought processes, and references (such as GitHub payload examples) used to guide building the system.
- **[docs/ARCHITECTURE_DESIGN_DRAFT.md](docs/ARCHITECTURE_DESIGN_DRAFT.md)**: The original blueprint for the multi-stage AI agent pipeline.

## Videos

- **[Part 1: Scoping the Assignment and Designing the Harness](https://youtu.be/vXDZ9Zny53o)**
- **[Part 2: Environment Setup and MVP Definition](https://youtu.be/mQKbwhBI-a8)**

## Getting Started

### Prerequisites

- Node.js (v20+)
- npm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/angelatyk/i-assignment.git
   cd ai-engineering-harness
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Environment Setup:
   Copy `.env.example` to `.env` and fill in your API keys (e.g., Anthropic, Google Gemini).
   ```bash
   cp .env.example .env
   ```

### Building Context Indexes

The `medplumExpert` requires localized source and FHIR schema indexes to provide deterministic context generation. You can build these before running the pipeline.

> [!NOTE]
> Pre-generated indexes are already included in `src/context/medplum/indexes/` for convenience. If you wish to rebuild them, ensure you have the Medplum repository cloned locally and use the command below.

```bash
# Build both source and FHIR indexes
npm run build:index
```

### Running Tests

We prioritize testing behavior and output contracts. Every agent has a dedicated test suite.

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage
```

## Development & Contribution Standard

When contributing to this system, strictly adhere to the following rules defined in the architecture plan:

- **Strict TypeScript**: No `any`, no implicit returns, and no unchecked nulls. Standardize shapes using `interfaces`.
- **Single Responsibility**: An agent should only do one thing. Never duplicate logic across agents; place shared helpers in `src/utils`.
- **Stateless Mutations**: Agents should _never_ mutate state directly. Instead, they must return their mutations via the node function return value for LangGraph to reduce into the global state.
- **Fail Gracefully**: Wrap all LLM and JSON parsing calls in `try/catch` and emit precise status failures to the graph logs.
