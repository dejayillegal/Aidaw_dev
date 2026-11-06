# Core recovery implementation — 6 November 2026

This branch implements the first recovery and integrity increments of the approved audit plan. It does **not** complete or qualify the full DAW specification. Base main: `195fa24ebfcbc036098eb0320742221b39146bef`.

## Implemented

- Restore the five complete modules from verified source commit `03d26ce`, undoing the misplaced/truncated-module regression without resetting the app or its contributor instructions.
- Add strict project/command validation, bounded event expansion, explicit replay IDs, immutable atomic batches, overlap lock enforcement and monotonic revision/proposal ownership guards.
- Add original-preserving legacy-v1 migration and checksummed current/previous snapshots. Invalid current bytes are archived before replacement. Save/quota errors are visible. Explicit project backup/open controls use the same validated format, with replacement confirmation.
- Vary style inventories by seed/density; retain user-added same-family tracks; produce exact requested section durations; retain crossing-clip material outside targeted regeneration and protect locked sections.
- Repair stereo antiphase sidechain detection; report effective wet/dry gain reduction; seed noise, IR and event decisions; repair deleted-lane cancellation, tempo rescheduling, zero-gain voices, negative first-note microtiming, asynchronous startup cancellation and graph disposal.
- Reject nonfinite PCM; correct integer PCM extrema; retain float headroom; independently inspect encoded WAV headers, frames and PCM; add 96k selection with an explicit PCM memory limit. Export rejects missing required sidechain DSP rather than silently changing the mix.
- Add project backup controls and mobile access to additional layers, reduce compact transport crowding, preserve normal Tab navigation and expose operation errors.
- Replace automatic archive extraction/commit workflow with manual read-only archive inspection. Add CI for typecheck/tests/build.

## Evidence

`npm run check` passed with strict TypeScript, 39 tests across nine files, and the Vite 7.3.7 production build. `npm audit --json` reported zero vulnerabilities after upgrading Vite to 7.3.7 and its esbuild dependency to 0.28.2. Node v24.22.1 and npm 11.9.0 were used. The suite includes a 200-project exact-duration corpus (8 styles × 5 durations × 5 seeds), plus command, persistence, regeneration, scheduler, WAV and sidechain-kernel regression cases. Sidechain tests execute the actual processor source with a test AudioWorklet host; they are not browser/audio-device measurements. Scheduler tests isolate event/parameter semantics, not full real-time performance.

Failing tests were recorded before the relevant repairs, including the broken imports, invalid transactions, duplicate/missing IDs, locked-span edits, replay-ID drift, incomplete articulation diffs, antiphase detector cancellation, wrong duration, dropped duplicate-family tracks, nonfinite/float/integer WAV defects, deleted automation, crossing-clip loss, negative microtiming and event-expansion limits.

## Gate ledger

| Gate | Status | Remaining qualification |
|---|---|---|
| G0 build/startup | BLOCKED | Typecheck/build and domain tests PASS; visible runtime startup still needs browser access |
| G1 project integrity | BLOCKED | Tested command/snapshot semantics; browser journeys, IndexedDB/WAL, concurrency/crash-fault qualification remain |
| G2 editing/automation | BLOCKED | Tested scheduler cancellation and protected edits; actual control/audio journeys and held-note seek/loop coverage remain |
| G3 musical composition | BLOCKED | Exact-duration corpus and variable inventories tested; reference-conditioned generation and producer listening remain |
| G4 synth/effects | BLOCKED | Existing synthesis preserved; complete device registry/FM/wavetable/sampler/racks/effect suite and signal qualification remain |
| G5 routing/sidechain | BLOCKED | Antiphase kernel regression fixed; actual browser graph, key-solo/tap semantics, arbitrary routing/per-destination controls remain |
| G6 playback reliability | BLOCKED | Scheduling/startup/cleanup repairs made; captured playback, long-load and device lifecycle evidence remain |
| G7 export | BLOCKED | WAV byte tests pass; actual full mix renders, ranges/stems/MIDI/ALS, verified OS saving and cancellation latency remain |
| G8 cross-platform | BLOCKED | No Android project, APK install, phone/tablet/fold or PWA upgrade evidence |

## Explicit limitations

The cloud browser cannot reach the workspace loopback preview; a shared-file navigation attempt was rejected by browser URL policy. No browser policy workaround was attempted. No screenshot/interaction/audio qualification is claimed.

No Qodo managed tools or executable, Autonom CLI, adb or Android target is available in this execution environment. Code review here is the implementing agent's source/test review, not an independent Qodo review. No APK was built or installed. Main should not be merged on a claim of production readiness.

Storage currently uses bounded, versioned localStorage snapshots with a previous valid revision and preserved legacy/quarantine bytes. It is **not** the full IndexedDB write-ahead command journal. The checksum detects accidental corruption and is not a cryptographic authenticity guarantee. History remains bounded in-memory snapshots. Full save/reopen UX must be checked in a browser.

Automation generation is retained conservatively when any section is locked, rather than changing interpolation through protected spans. Full per-span automation regeneration still needs the target-addressed lane/curve extension. Global tempo/production-mode changes are not section-local locks.

Variable inventories and manual same-family tracks are an initial layer-identity increment, not the complete versioned LayerDescriptor architecture or a measured musical-quality improvement. The current source has not been compared anew against the six external reference ALS files.

The master DynamicsCompressor is not a qualified true-peak limiter; the meters are not LUFS. WAV byte inspection verifies the generated download data, not a user's disk write, loudness compliance or live/offline audio parity. A float WAV may retain values beyond unity. Integer formats clip to their defined range. The render adds the existing four-second tail; configurable tails and aligned stems remain open. The 256 MiB PCM budget excludes graph/assets/encoded copies, so real device memory budgets still require measurement.

## Next integration gate

Obtain real browser playback/render evidence for this exact branch, resolve any runtime faults, then complete the remaining persistence/automation/device work. Android packaging and further sound-engine features stay behind the approved playback/export qualification gate. Keep each later increment and its evidence separate; do not mark G0–G8 PASS from these unit checks.
