# AGENTS.md — Repository Development Guidelines

These guidelines apply to **every change in this repository**, including new features, bug fixes, refactoring, UI changes, API changes, scripts, configuration, and documentation.

The objective is to maintain a clean, consistent, maintainable, well-tested, and production-ready codebase.

Treat the existing codebase as the source of truth. Understand its architecture and conventions before making changes. Prefer extending existing functionality over introducing new patterns or abstractions.

---

# 1. General Development Principles

## 1.1 Understand Before Changing

- Always inspect the relevant parts of the codebase before implementing a change.
- Understand how the existing functionality works and how the affected components interact.
- Identify existing functions, hooks, utilities, types, components, and patterns that can be reused.
- Check whether the requested functionality already exists in another part of the application.
- Understand the dependencies and potential side effects of a change before modifying code.
- Do not assume that a new implementation is necessary just because the existing implementation is not immediately obvious.
- Follow the established architecture and conventions unless there is a concrete reason to improve them.

**Never start implementing a feature without first understanding where its responsibilities belong.**

## 1.2 Keep Changes Focused

- Keep every change as small and focused as reasonably possible.
- Only modify code that is necessary for the requested behavior.
- Do not introduce unrelated improvements, refactoring, formatting changes, or architectural changes.
- Avoid modifying working functionality unless the requested change requires it.
- Do not solve hypothetical problems that are outside the scope of the task.
- Avoid unnecessary dependencies and additional configuration.
- Preserve existing behavior unless a change explicitly requires otherwise.

If a broader refactoring is genuinely necessary, explain why before expanding the scope.

## 1.3 Prefer Simplicity

- Prefer straightforward implementations over clever or overly abstract solutions.
- Write code that another developer can understand without extensive investigation.
- Avoid premature optimization and premature abstraction.
- Do not introduce abstractions for functionality that is only used once unless there is a clear architectural benefit.
- Avoid deeply nested conditionals and unnecessarily complex control flows.
- Prefer early returns and clearly separated responsibilities.
- Avoid excessive indirection between functions and modules.

The simplest maintainable solution is usually the preferred solution.

---

# 2. Code Reuse and Maintainability

## 2.1 Reuse Existing Functionality

**Always prefer reusing existing functionality over implementing something new.**

Before creating a function, hook, utility, component, or helper:

1. Search the codebase for existing implementations with similar responsibilities.
2. Check whether an existing implementation can be extended.
3. Check whether the functionality already exists under a different name or in another layer.
4. Determine whether existing shared functionality can be reused.
5. Only create something new if existing functionality cannot reasonably fulfill the requirement.

Additional rules:

- Never duplicate existing business logic.
- Never create a second implementation of functionality that already exists.
- Do not copy and slightly modify existing functions when the original can be generalized safely.
- Prefer extending existing functions with optional parameters or clearly defined configuration when appropriate.
- Do not create unnecessary wrapper functions that only forward arguments to another function.
- Do not create multiple utilities that perform essentially the same operation.
- Keep shared logic centralized in the appropriate existing module.
- When two pieces of code perform the same operation, consider whether they should use a common implementation.

However, avoid creating overly generic utilities simply to eliminate a few lines of duplication.

**Code reuse should improve consistency and maintainability, not introduce unnecessary abstraction.**

## 2.2 Functions and Responsibilities

- Each function should have one clearly identifiable responsibility.
- Use descriptive names that explain the purpose of the function.
- Keep functions reasonably small and easy to understand.
- Avoid functions with many unrelated parameters.
- Prefer explicit arguments over hidden dependencies.
- Avoid unnecessary side effects.
- Keep pure logic pure whenever possible.
- Separate business logic from presentation and infrastructure concerns.
- Do not make functions responsible for unrelated tasks.
- Avoid deeply nested function definitions unless there is a clear reason.

When a function becomes difficult to understand, consider extracting meaningful parts into existing or appropriately scoped helpers.

Do not extract every few lines into a separate function.

## 2.3 Naming Conventions

Use names that communicate intent.

- Prefer descriptive names over abbreviations.
- Use consistent naming conventions throughout the repository.
- Avoid generic names such as `data`, `item`, `result`, or `handler` when a more specific name is available.
- Boolean variables should communicate a condition, preferably using `is`, `has`, `can`, or `should`.
- Functions should generally describe an action or return value.
- Components should have names that reflect their purpose.
- Constants should have meaningful names.

Avoid names that merely describe implementation details when they obscure the actual purpose.

## 2.4 Comments and Documentation in Code

Code comments should explain **why something is done, not what the code is doing.**

The code itself should communicate what it does through clear naming and structure.

Good comments explain:

- Why a particular implementation or workaround is necessary.
- Why a seemingly unusual decision was made.
- Why a specific validation or restriction exists.
- Why a particular order of operations must be preserved.
- Why an edge case needs special treatment.
- Why a dependency or compatibility constraint exists.

Bad comments simply translate code into natural language.

Do not write comments like:

- `// Loop through all users`
- `// Set the loading state`
- `// Return the result`
- `// Check if the user exists`

Prefer comments like:

- `// Keep this check before the database query to avoid unnecessary lookups for invalid identifiers.`
- `// Preserve the original timestamp because downstream integrations depend on its timezone.`
- `// This fallback is required for older records created before the field became mandatory.`

Additional rules:

- Add comments when they provide meaningful context.
- Do not comment every function, variable, or code block.
- Avoid redundant comments.
- Remove outdated comments when changing the associated implementation.
- Do not leave TODO comments as a substitute for completing requested functionality.
- If a workaround is necessary, explain its reason and relevant constraints.
- Use JSDoc for exported functions and complex public interfaces when it adds useful information.
- JSDoc should document purpose, parameters, return values, and relevant constraints, not repeat the implementation.

---

# 3. Architecture and Separation of Concerns

Place functionality in the layer that owns its responsibility.

Follow the existing repository architecture.

General responsibility boundaries:

| Location | Responsibility |
|---|---|
| `packages/shared` | Shared types, schemas, constants, pure helpers and reusable business-independent logic |
| `apps/api` | API routes, server-side business logic, authentication, authorization, database operations and integrations |
| `apps/web` | UI, frontend state, interactions, presentation and client-side behavior |
| `scripts` | Build, deployment, maintenance and development scripts |

Rules:

- Do not put frontend-specific functionality into shared packages.
- Do not duplicate shared types between frontend and backend.
- Do not put database access inside UI components.
- Do not put presentation logic into API routes.
- Do not move functionality into shared packages simply because multiple files use it.
- Only share functionality when its responsibility genuinely belongs in a shared layer.
- Avoid circular dependencies.
- Avoid importing internal implementation details from unrelated application layers.
- Keep module boundaries clear and predictable.

Before introducing a new directory, module, or architectural pattern, check whether the existing structure already provides an appropriate location.

---

# 4. TypeScript and General Coding Standards

## 4.1 Type Safety

- Use TypeScript strictly.
- Never use `any`.
- Avoid type assertions unless they are genuinely necessary.
- Never use non-null assertions (`!`) to bypass type checking.
- Prefer explicit and accurate types over broad or ambiguous types.
- Use existing shared types whenever possible.
- Avoid duplicating type definitions.
- Use discriminated unions for complex state and result types when appropriate.
- Handle nullable and optional values explicitly.
- Validate external input at runtime rather than relying exclusively on TypeScript types.
- Keep API request and response types consistent.

Do not silence TypeScript errors just to make the build pass.

Fix the underlying type problem.

## 4.2 Data Handling

- Validate data at application boundaries.
- Treat external API responses, user input, environment variables, and database records as potentially invalid.
- Avoid implicit assumptions about data availability.
- Handle missing, empty, malformed, and unexpected values.
- Avoid mutating objects or arrays unnecessarily.
- Prefer immutable transformations when appropriate.
- Avoid unsafe parsing and serialization.
- Ensure dates, timestamps, numbers, and identifiers are handled consistently.
- Consider timezone implications whenever working with dates and times.

## 4.3 Asynchronous Operations

- Handle rejected promises explicitly.
- Avoid unhandled asynchronous operations.
- Use `async/await` consistently with surrounding code.
- Avoid unnecessary sequential operations when independent operations can safely run in parallel.
- Do not introduce concurrency where operation ordering matters.
- Handle cancellation and stale requests where relevant.
- Avoid race conditions in UI and API operations.
- Ensure loading and error states are correctly managed.

## 4.4 Error Handling

Errors must be handled where the relevant operation takes place.

- Do not silently swallow errors.
- Do not return misleading success responses after failures.
- Avoid generic catch blocks that hide the underlying problem.
- Provide useful error messages without exposing sensitive internal information.
- Use consistent error formats across the application.
- Distinguish validation errors, authorization errors, missing resources, conflicts, and unexpected server errors.
- Log errors where appropriate.
- Avoid logging credentials, tokens, personal information, or sensitive request data.
- Ensure the user receives meaningful feedback when an operation fails.

Always consider both the successful and unsuccessful execution paths.

---

# 5. Frontend and UI Development

The existing application design system is the source of truth.

Every UI change must look and behave as though it was part of the application from the beginning.

## 5.1 Reuse Existing UI Components

**Always reuse existing UI components before creating new ones.**

Before implementing UI functionality:

1. Inspect the existing component library.
2. Search for components with similar appearance or behavior.
3. Check whether existing components support the required configuration.
4. Reuse and extend existing components where appropriate.
5. Only create a new component when existing components cannot reasonably fulfill the requirement.

Rules:

- Do not create duplicate buttons, dialogs, inputs, dropdowns, tables, cards, or other common UI elements.
- Do not implement special-case versions of existing components.
- Do not recreate functionality that already exists in shared UI components.
- Prefer composition and existing component variants over duplicated markup.
- Extend existing components carefully without breaking their current usage.
- Keep shared components reusable and independent of individual feature implementations.
- Avoid creating components that are only thin wrappers around existing components without providing meaningful value.

Do not introduce a new UI component simply because it is faster than finding and reusing an existing one.

## 5.2 Design Consistency

- Follow the existing design system.
- Reuse established colors, typography, spacing, borders, shadows, radii, and layout patterns.
- Use existing design tokens and CSS variables.
- Prefer existing component variants over custom styling.
- Use shadcn primitives for frontend UI.
- Follow the existing component composition patterns.
- Keep the interface simple, intuitive, and predictable.
- Avoid introducing new visual styles without a clear reason.
- Do not use OS-native dialogs, controls, or styling when an existing application component is appropriate.
- Avoid unnecessary visual decoration and excessive animations.

The UI should feel consistent across all pages and features.

## 5.3 Layout Stability

Avoid layout shifts wherever possible.

- Reserve space for asynchronously loaded content.
- Use predictable component dimensions.
- Avoid changing element dimensions unnecessarily during loading.
- Keep buttons and other interactive elements dimensionally stable when their state changes.
- Avoid inserting content in a way that unexpectedly moves surrounding elements.
- Use skeletons or existing loading patterns where appropriate.
- Prevent layout shifts caused by validation messages, notifications, and conditional content.
- Consider responsive layouts and different viewport sizes.

Layout stability is a core quality requirement, not a cosmetic improvement.

## 5.4 UI States

Every interactive component must handle its relevant states.

Consider:

- Initial state.
- Loading state.
- Success state.
- Empty state.
- Error state.
- Disabled state.
- Validation state.
- Permission-restricted state.

Do not implement only the ideal success scenario.

Examples:

- Tables should have meaningful empty and loading states.
- Forms should provide clear validation feedback.
- Dialogs should handle submission errors.
- Buttons should prevent unintended duplicate submissions.
- Asynchronous actions should communicate their progress.
- Destructive actions should require appropriate confirmation.

Use existing patterns and components for these states.

## 5.5 Accessibility

- Use semantic HTML.
- Ensure interactive elements are keyboard accessible.
- Provide accessible labels for inputs and controls.
- Use appropriate ARIA attributes where necessary.
- Maintain sufficient color contrast.
- Ensure focus states are visible.
- Do not rely exclusively on color to communicate information.
- Use appropriate heading hierarchy.
- Support screen readers.
- Ensure dialogs and popovers follow accessible interaction patterns.

Accessibility should be considered during implementation, not added as an afterthought.

## 5.6 Frontend Performance

- Avoid unnecessary re-renders.
- Avoid unnecessary state.
- Keep state as close as reasonably possible to the components that need it.
- Reuse existing hooks and state management patterns.
- Avoid unnecessary `useEffect` usage.
- Prefer derived values over duplicated state.
- Avoid expensive computations during rendering when they can reasonably be avoided.
- Lazy-load larger features where appropriate.
- Avoid unnecessary dependencies and oversized imports.
- Clean up subscriptions, event listeners, and other resources when necessary.

Do not optimize prematurely, but avoid introducing obvious performance problems.

---

# 6. API and Backend Development

## 6.1 API Design

- Follow existing API conventions.
- Keep routes focused on HTTP-level responsibilities.
- Reuse existing validation, authentication, authorization, and response utilities.
- Validate all incoming data.
- Use consistent request and response structures.
- Return appropriate HTTP status codes.
- Do not expose internal database structures unnecessarily.
- Avoid leaking implementation details through error responses.
- Handle missing resources explicitly.
- Ensure pagination, filtering, and sorting behave consistently where applicable.

## 6.2 Authentication and Authorization

- Never assume that an authenticated user is automatically authorized.
- Verify permissions for every protected operation.
- Enforce authorization on the server, not only in the frontend.
- Prevent users from accessing or modifying resources belonging to other users.
- Reuse existing authentication and permission utilities.
- Handle expired or invalid sessions correctly.
- Never expose passwords, tokens, secrets, or sensitive authentication data.
- Follow existing security patterns.

## 6.3 Database Operations

- Reuse existing database access functions and query patterns.
- Avoid duplicating database logic across routes.
- Use transactions when multiple operations must succeed or fail together.
- Handle missing records and database constraint violations.
- Avoid unnecessary queries.
- Consider indexing and query performance for frequently accessed data.
- Preserve data integrity.
- Do not introduce schema changes without considering existing data.
- Provide appropriate migrations for database changes.
- Ensure migrations are safe and reproducible.

Never assume that a database operation succeeded without checking its outcome.

## 6.4 Security

Security is a requirement for every change, not a separate development phase.

Always consider:

- SQL injection.
- Cross-site scripting (XSS).
- Cross-site request forgery (CSRF), where applicable.
- Broken access control.
- Authentication bypasses.
- Insecure direct object references.
- Unsafe file uploads.
- Path traversal.
- Server-side request forgery (SSRF).
- Sensitive information disclosure.
- Rate limiting and abuse prevention.
- Unsafe redirects.
- Improper input validation.
- Insecure environment configuration.

Do not introduce insecure shortcuts for convenience.

Never commit secrets, credentials, private keys, or production environment files.

---

# 7. Testing

Meaningful tests are mandatory.

**A change is not complete until its relevant tests pass.**

Use Vitest (`npm test`) and follow the existing test conventions.

Keep tests next to the code they cover, matching the existing `*.test.ts` naming patterns.

## 7.1 Test Requirements

Add or update tests for every part of the application affected by a change.

This includes:

- Shared helpers and utilities.
- API routes.
- Business logic.
- Database-related behavior where appropriate.
- Scripts.
- Frontend components.
- UI interactions.
- Validation.
- Error handling.

Do not consider a feature adequately tested simply because its main success path works.

## 7.2 Test Observable Behavior

Tests should verify behavior that users or callers can actually observe.

Test:

- Expected successful behavior.
- Invalid input.
- Missing data.
- Boundary conditions.
- Permission failures.
- Authentication failures.
- Network or dependency failures where relevant.
- Database errors where relevant.
- Unexpected but possible input.
- Loading, empty, and error UI states where applicable.

Avoid testing implementation details that make tests unnecessarily brittle.

## 7.3 Test Quality

- Use descriptive test names.
- Keep tests focused.
- Avoid unnecessary mocking.
- Mock external dependencies when appropriate.
- Do not mock the functionality that the test is supposed to verify.
- Reuse test utilities and fixtures.
- Keep test data predictable.
- Ensure tests are independent of execution order.
- Avoid flaky tests and arbitrary timeouts.
- Do not weaken or remove tests simply to make a change pass.

## 7.4 Verification

After implementing a change:

1. Run the relevant tests.
2. Run the complete test suite when appropriate.
3. Run TypeScript type checking.
4. Run the production build.
5. Run linting if configured.
6. Review the final diff.
7. Check for unintended changes.

Do not claim that tests or builds passed unless they were actually executed successfully.

If a check cannot be executed, explicitly report why.

If a test fails:

- Determine whether the failure is caused by the new implementation or an existing issue.
- Fix failures introduced by the change.
- Do not ignore failures without explaining them.

---

# 8. Dependencies and Configuration

- Prefer existing dependencies over adding new ones.
- Do not add a dependency for functionality that can reasonably be implemented using existing tools.
- Before adding a dependency, evaluate its maintenance status, security, size, compatibility, and licensing.
- Avoid unnecessary overlapping libraries.
- Keep dependency versions consistent with existing project conventions.
- Update lockfiles when dependencies change.
- Do not introduce unnecessary build tools or runtime dependencies.
- Keep configuration changes focused.
- Preserve compatibility with the supported runtime and deployment environments.

Environment-specific configuration must not be hardcoded.

---

# 9. Scripts and Deployment

The application should remain straightforward to deploy and maintain.

The primary target VPS provider is Hetzner, but deployment must not depend on Hetzner-specific infrastructure.

## 9.1 Provider Independence

- Deployment scripts must work with any suitable VPS provider.
- Do not hardcode Hetzner-specific IP addresses, paths, hostnames, or infrastructure assumptions.
- Use configurable environment variables.
- Keep provider-specific functionality optional and isolated.
- Document generic server prerequisites.
- Avoid unnecessary provider-specific dependencies.

## 9.2 Deployment Simplicity

Make deployment as straightforward as reasonably possible.

- Minimize manual configuration steps.
- Provide clear setup instructions.
- Validate required configuration before deployment.
- Fail early with useful error messages.
- Avoid destructive deployment operations without explicit safeguards.
- Ensure deployment scripts are repeatable.
- Avoid unnecessary downtime.
- Keep application configuration separate from deployment implementation.
- Document required environment variables.
- Provide sensible defaults where safe.

A developer should be able to deploy the application to a suitable VPS without having to understand provider-specific internals.

## 9.3 Scripts

- Keep scripts in `scripts/`.
- Use clear names and focused responsibilities.
- Handle errors explicitly.
- Validate arguments and environment variables.
- Avoid hardcoded credentials.
- Make scripts safe to execute repeatedly where possible.
- Clearly communicate what a script will modify.
- Avoid destructive operations without confirmation or appropriate safeguards.

---

# 10. Documentation and Versioning

Documentation must remain synchronized with the implementation.

## 10.1 README

When a change affects functionality, configuration, setup, usage, architecture, or deployment, update the root `README.md` where appropriate.

Documentation should explain:

- What the functionality does.
- How it is configured.
- How it is used.
- Any relevant limitations.
- Any new environment variables.
- Any changes to setup or deployment.
- Any relevant prerequisites.

Do not add documentation that merely repeats obvious implementation details.

Do not leave outdated instructions after changing functionality.

## 10.2 Version Number

After every completed change, update the version number in the root `package.json`.

Use the following version format:

`0.0.nnn`

Rules:

- Increment the final numeric segment by one for each completed change.
- Preserve the first and second version segments as `0.0`.
- Do not reset or reuse an existing version number.
- Check the current version before incrementing.
- Do not update the version for intermediate development steps within the same requested change.
- Update the version only once when the complete change is finished.
- Ensure the root `package.json` contains the correct final version.

Example:

`0.0.104` → `0.0.105`

---

# 11. Refactoring

Refactoring must improve the codebase without changing observable behavior unless explicitly requested.

- Avoid unnecessary refactoring during feature development.
- Preserve existing public interfaces where possible.
- Do not change unrelated function signatures.
- Avoid large-scale architectural changes for small features.
- Reuse existing functionality.
- Remove genuinely obsolete code when appropriate.
- Do not leave duplicate implementations after refactoring.
- Keep changes easy to review.
- Ensure existing tests continue to pass.

If a refactoring introduces a new abstraction, there should be a clear and demonstrable benefit.

---

# 12. Working With Existing Code

When working in an established part of the application:

- Follow the conventions of the surrounding code.
- Prefer consistency over personal stylistic preferences.
- Do not introduce a different approach simply because you prefer it.
- Check how similar functionality is implemented elsewhere.
- Reuse existing hooks, utilities, services, components, schemas, and types.
- Preserve existing interfaces unless there is a good reason to change them.
- Consider backwards compatibility.
- Avoid unnecessary file movements and renaming.
- Avoid reformatting entire files when only a small section needs modification.

Do not create a parallel architecture alongside the existing one.

---

# 13. Prohibited Practices

Unless explicitly justified and approved, do not:

- Duplicate existing functionality.
- Create unnecessary abstractions.
- Create duplicate UI components.
- Introduce unnecessary dependencies.
- Use `any`.
- Bypass type errors with unsafe assertions.
- Suppress errors without a documented reason.
- Ignore failed tests.
- Leave incomplete functionality.
- Leave placeholder implementations in production code.
- Hardcode environment-specific values.
- Expose secrets or sensitive information.
- Add comments that simply describe what the code does.
- Modify unrelated files.
- Perform broad refactoring without a clear need.
- Change established design patterns without justification.
- Claim successful verification without actually running it.
- Create commits unless explicitly requested.

---

# 14. Required Workflow for Every Change

Follow this workflow for every requested task.

## Step 1 — Understand

- Read the relevant files.
- Understand the existing implementation.
- Identify affected layers and dependencies.
- Search for reusable functionality.
- Identify relevant tests and documentation.
- Consider potential edge cases and security implications.

## Step 2 — Plan

- Determine the smallest appropriate implementation.
- Identify which existing functions and components can be reused.
- Identify which files need to change.
- Determine which tests need to be added or updated.
- Consider whether documentation needs updating.

Avoid unnecessary planning overhead for trivial changes, but always understand the scope before editing.

## Step 3 — Implement

- Follow the existing architecture.
- Reuse existing functionality wherever possible.
- Keep changes focused.
- Handle success and failure paths.
- Maintain type safety.
- Follow established UI and design patterns.
- Avoid introducing unnecessary complexity.

## Step 4 — Test

- Add or update meaningful tests.
- Run relevant tests.
- Run TypeScript checks.
- Run the production build.
- Run linting if configured.
- Resolve failures introduced by the change.

## Step 5 — Review

Before considering the task complete, review the final diff.

Ask yourself:

- Did I reuse existing functions and components wherever possible?
- Did I introduce duplicated logic?
- Did I create unnecessary abstractions?
- Are responsibilities in the correct application layer?
- Are errors and edge cases handled?
- Are types correct?
- Is the UI consistent with the existing design?
- Have accessibility and layout stability been considered?
- Are there security implications?
- Are the tests meaningful?
- Is the documentation up to date?
- Has the root package version been incremented correctly?
- Did I accidentally modify unrelated files?

Fix any issues identified during this review.

## Step 6 — Finalize

Once the change is complete:

- Update the relevant documentation.
- Increment the root `package.json` version.
- Ensure all relevant checks have been executed.
- Prepare a concise commit summary.
- Do not create a commit unless explicitly requested.

---

# 15. Required Completion Report

After every completed change, provide a report using exactly this structure:

## Summary

One sentence explaining why the change was made.

## Description

Two or three sentences explaining:

- What was changed.
- Which application areas or functionality are affected.
- How the change was verified.

Mention relevant test results, type checking, linting, and build results.

If a check could not be performed or failed, state that explicitly.

Example:

**Summary**

Improve API authentication handling to prevent unauthorized access to user resources.

**Description**

Updated the API authorization middleware to enforce resource ownership and reused the existing permission utilities. Added tests covering successful access, unauthorized requests, and cross-user resource access. Verified with Vitest, TypeScript checks, and the production build.

---

# 16. Final Development Principles

When making decisions, prioritize these principles in the following order:

1. **Correctness:** The functionality must work as intended, including edge cases.
2. **Security:** Changes must not introduce security vulnerabilities.
3. **Consistency:** Follow existing architecture, patterns, and design conventions.
4. **Reusability:** Reuse existing functions, utilities, types, hooks, and UI components.
5. **Maintainability:** Code should be easy to understand, extend, and debug.
6. **Testability:** Changes must be verifiable through meaningful tests.
7. **Simplicity:** Avoid unnecessary abstractions, dependencies, and complexity.
8. **Performance:** Avoid unnecessary resource usage and inefficient implementations.

**The objective is not to write the most code or the most sophisticated solution. The objective is to make the smallest correct, secure, consistent, and maintainable change that fully solves the problem.**