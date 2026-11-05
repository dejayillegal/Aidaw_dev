# Repository skills and workflows

This file records reusable project workflows for contributors and coding agents. It is not a claim that automated tests or platform integrations currently exist.

## 1. Repository orientation

- Application entry: `src/main.tsx` and `src/App.tsx`
- Shared application state: `src/store.ts`
- User/composer action wiring: `src/actions.ts`
- Composition model and generation: `src/engine/types.ts` and `src/engine/composer.ts`
- Commands and undo history: `src/engine/commands.ts`
- AI proposals: `src/engine/assist.ts`
- Web Audio playback, scheduling, and WAV export: `src/engine/audio.ts`
- Timeline and editor surfaces: `src/components/`
- Project dependencies and scripts: `package.json`

Check the actual checkout before relying on this map; paths or responsibilities may change.

## 2. Establish a baseline

1. Inspect the current source and git diff before editing.
2. Check `package.json` for available scripts. Currently documented scripts are `dev`, `build`, and `preview`; do not invent test results or assume a test runner is installed.
3. Install dependencies only where network/tool access is permitted; retain the lockfile and report unavailable network access as **BLOCKED**.
4. Capture reproducible behaviors and defects before making fixes. Preserve a clear before/after record.

## 3. Integrity-first bug fixing

For project commands and proposals:

- Assign IDs before executing commands that may be replayed.
- Validate IDs/references and parameter bounds.
- Make batch validation/application atomic.
- Track project revisions; accept proposals only when their base revision and affected scope remain valid.
- Preserve track and section locks for clips and automation, including edits that overlap section boundaries.
- Test undo, redo, replacement, selection, transport, preview, and audition synchronization.

For persistence:

- Keep v1 import compatibility and use explicit migrations for future schemas.
- Retain recoverable revisions, check integrity, and display save failures.
- Preserve the original localStorage project during any import to a new persistence backend.

## 4. Audio and export workflow

- Preserve the shared realtime/offline graph and scheduler unless parity tests justify a change.
- Use deterministic randomness and event expansion so seek, loop, probability, noise, and offline rendering have explicit consistent semantics.
- Test stereo key detection using channel energy, not signed channel averaging.
- Do not describe scheduled ducking as equivalent to compressor sidechain processing.
- Verify graph teardown and active source cleanup after repeated play/stop and export cycles.
- Decode the encoded output independently and verify format headers, duration, finite samples, peak/RMS, and tail behavior. Check cancellation and render limits.
- Treat composition metrics as diagnostics, not substitutes for listening review.

## 5. Responsive UI and Android workflow

- Preserve desktop operation and keyboard accessibility while implementing touch gestures.
- Test phone/tablet layouts, resizing/fold changes, safe areas, accessible canvas alternatives, and focus behavior.
- For a Capacitor integration, build the web application first, add and sync the Android platform, then build a debug APK with Gradle/Android Studio.
- Record exact tool versions and command results. Install and launch the APK on identified Android phone and tablet targets before claiming qualification.
- Audio focus, route changes, lifecycle restoration, and background playback require explicit Android validation; background playback requires a tested native media-service design.

## 6. Evidence status

Use one status for each check or gate:

- **PASS** — run and verified with recorded evidence.
- **FAIL** — run and failed; include diagnostics.
- **BLOCKED** — could not run because a prerequisite, network, SDK, or device was unavailable.
- **NOT TESTED** — not attempted.

Never infer complete release readiness from a successful web build or APK assembly alone.
