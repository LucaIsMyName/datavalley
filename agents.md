# Agent guidelines

Follow these rules for every change in this repository.

## Write well structured code

- Keep each change small and limited to the behavior it is meant to change.
- Put logic in the layer that already owns it: shared types and pure helpers in `packages/shared`, API behavior in `apps/api`, UI in `apps/web`, and scripts in `scripts`.
- Prefer clear names, small functions, and existing patterns in the surrounding files over new abstractions.
- Handle errors and edge cases in the same place the happy path lives. Do not leave partial behavior for a later pass.

## Write meaningful tests

- Add or update tests for every part of the application a change touches: API routes, shared helpers, scripts, and UI behavior.
- Test the behavior a user or caller can observe, including failure and edge cases, not only the success path.
- Use Vitest (`npm test`). Keep tests next to the code they cover, matching the existing `*.test.ts` files.
- A change is incomplete until its tests pass.

## Design
- when designing UI's make sure everything stays consistent and we use the design elements and ui components we already have
- re-use componenents instead of creating new ones for special cases, only when absolutely necessary
- use shadcn primitives in the frontend
- keep design simple and intuitive
- avoid layout shifts in UI at all costs
- dont use OS Design only when really necessary, prefer the apps own UI

## Update the Documentation and 'package.json' version in root from `0.0.nnn'

- When a change is finished, update the docs where needed after a code change
    - README.md in root
- When a change is finished:; update the version number in the root `package.json` of the last comma version (the first and second only the dev changes)
- the target VPS will be hetzner, but write deploy script and prerequists for any potential VPS Provider
- make deployment as easy as possible for developer to anywhere developer wants to put the app

## After every change

- When a change is finished, report a commit summary and description. Do not create the commit unless asked.

Use this format:

**Summary**

One line that says why the change exists.

**Description**

Two or three sentences covering what changed, what it affects, and how it was verified.
