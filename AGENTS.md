# Agent and contributor instructions

## First steps

1. Inspect the repository, current branch, and recent changes before editing. Confirm file contents and paths; do not assume a previous patch is correct.
2. Read `README.md`, `package.json`, and the relevant source modules before making changes.
3. Keep edits scoped, preserve working architecture, and report missing toolchain or verification gaps as BLOCKED or NOT TESTED.

## Preserve application behavior

AIDAW is more than a loop generator. Preserve the existing React workspace, external store, Web Audio gesture startup, composition grammars, multi-section arrangement logic, transitions, continuous automation, command pipeline, shared playback/export graph, and genuine sidechain DSP. Avoid simplifying or replacing these features during unrelated changes.

Before modifying source, verify that the target file contains the expected code. For broad refactors, establish a baseline and make focused, reviewable edits. Never replace a module with a partial excerpt or placeholder.

## Safe engineering

- Keep user edits intact. AI proposals must be based on the current project revision and must not silently overwrite later edits.
- Respect track and section locks during generation, command replay, clips, and automation edits.
- Make repeated command execution deterministic when replay semantics require it; allocate generated IDs explicitly rather than generating them implicitly.
- Validate project data, command references, and numerical ranges at boundaries. Invalid command batches should fail atomically.
- Preserve v1 project compatibility when evolving persistence schemas. Never silently discard a user's only saved copy; surface save and recovery errors.
- Do not claim playback/export parity, audio quality, mobile reliability, or gate completion without evidence.
- Clean up Web Audio nodes, active sources, worklets, timers, and object URLs appropriately.

## Android changes

- Treat Capacitor as a wrapper around the existing web app for the first Android milestone; keep the web implementation usable.
- Use bundled local web assets for the packaged app.
- Keep native DSP migration separate and behind an explicit backend interface and parity tests.
- An APK build is not Android qualification. Record the exact build identity and test install/startup, audio interruptions, exports, and phone/tablet behavior on actual target devices.
- Do not commit generated APKs, signing secrets, keystores, or local SDK paths unless specifically requested and allowed.

## Verification and reporting

- Run only commands that are defined and available in the checked-out repo.
- If dependencies or network access are unavailable, state that explicitly instead of claiming checks passed.
- Report results accurately. A successful web build does not replace audio or device testing.
- Mark release gates PASS, FAIL, BLOCKED, or NOT TESTED, and include evidence and relevant build identity.
- Keep the final summary concise: files changed, commands run, outcomes, and remaining blockers.
