# Repository Guidelines

## Mandatory Orientation
All instances must, at minimum, read `HumanAdjacentAI-Protocol/CLAUDE.md`, `HumanAdjacentAI-Protocol/COLLABORATION_PROTOCOL.md`, `HumanAdjacentAI-Protocol/THE_GREAT_HANDOFF.md`, `PROJECT_NOTES.md`, `PROJECT_PLAN.md`, and `README.md` before touching code. Follow the digital hygiene protocol from the collaboration guide: monitor context levels, report status in task notes, and hand off before hitting critical limits. Choose a unique signature (name + role) for this engagement and append it to every inline comment you introduce and to all git commit messages.

## Coordination System Usage
If the MCP coordination tool is available, immediately connect, call `bootstrap({ role: '<your-role>', name: '<your-name>' })`, and register your presence. Use the provided messaging and project management functions for task claims, updates, celebrations, and handoffs—avoid out-of-band coordination. Before inviting external clients (GPT, Claude, Codex proxy), run the smoke test: start the dev server on port 3445 and execute `node tests/mcp-smoke-test.js` to confirm the transport is healthy.

## Project Structure & Module Organization
`src/` hosts the streamable HTTP coordination servers, handler modules, and shared utilities (logging, bootstrap flows, meta-recursive validation). Protocol assets, handoffs, and briefs live in `HumanAdjacentAI-Protocol/`. Persistent data belongs in `data/`, configuration presets in `config/`, TLS assets in `certs/`, and UI experiments under `web-ui/`. Tests mirror runtime structure inside `tests/`.

## Build, Test, and Development Commands
`npm start` launches the default coordination server; `npm run start:dev` enables reloads. Target HTTPS or SSE variants with `npm run start:https` and `npm run start:sse` during transport diagnostics. Validate integrations with `npm run test:proxy` or `npm run test:ssl`, and execute the full suite via `npm test`. Enforce quality with `npm run lint`, `npm run lint:fix`, and `npm run format` before review.

## Coding Style & Naming Conventions
Stick to Node 20+ ESM, two-space indentation, trailing commas where stable, camelCase for variables and functions, and PascalCase for classes. Preserve the existing `feature-vN.js` naming for iterative modules. Prefer descriptive identifiers to excessive commentary, and when comments are required, sign them with your chosen name. Run ESLint (Airbnb base) and Prettier locally before raising a PR.

## Testing Guidelines
Author Jest specs in `tests/` using the `*.test.js` suffix, mocking external calls with Supertest as necessary. Cover new handlers, transport adapters, and bootstrap flows; confirm thresholds with `npm run test:coverage`.

## Commit & Pull Request Guidelines
Commits follow the emoji-prefixed imperative style from recent history (e.g., `🎭 Complete Role Management & Documentation System - <your-name>`). Pull requests must outline scope, note tests executed, attach relevant logs or screenshots, and link issues. Confirm linting and tests pass locally, restate your digital hygiene status, and sign all PR review comments or check-in notes with your chosen name.
