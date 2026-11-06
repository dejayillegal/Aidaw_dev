# Core recovery implementation — 6 November 2026

This branch implements the first recovery and integrity increments of the approved audit plan. It does **not** complete or qualify the full DAW specification. This increment starts from merged main `80be9ae` (PR #3).

## Implemented

- Restore the five complete modules from verified source commit `03d26ce`, undoing the misplaced/truncated-module regression without resetting the app or its contributor instructions.
- Add strict project/command validation, bounded event expansion, explicit replay IDs, immutable atomic batches, overlap lock enforcement and monotonic revision/proposal ownership guards.
- Add original-preserving legacy-v1 migration and checksummed current/previous snapshots. Invalid current bytes are archived before replacement. Save/quota errors are visible. Explicit project backup/open controls use the same validated format, with replacement confirmation.
- Vary style inventories by seed/density; retain user-added same-family tracks; produce exact requested section durations; retain crossing-clip material outside targeted regeneration and protect locked sections.
- Repair stereo antiphase sidechain detection; report effective wet/dry gain reduction; seed noise, IR and event decisions; repair deleted-lane cancellation, tempo rescheduling, zero-gain voices, negative first-note microtiming, asynchronous startup cancellation and graph disposal.
- Reject nonfinite PCM; correct integer PCM extrema; retain float headroom; independently inspect encoded WAV headers, frames and PCM; add 96k selection with an explicit PCM memory limit. Export rejects missing required sidechain DSP rather than silently changing the mix.
- Add project backup controls and mobile access to additional layers, reduce compact transport crowding, preserve normal Tab navigation and expose operation errors.
- Replace automatic archive extraction/commit workflow with manual read-only archive inspection. Add CI for typecheck/tests/build.

- Add an IndexedDB transaction that commits the SHA-256 checked current snapshot, previous valid snapshot and typed journal together. Serialize store saves, reject stale-window tokens, preserve damaged bytes, recover verified checkpoint/command entries, and bound journal retention. Explicit Project-menu choices protect divergent local/database work without guessing ancestry from revision numbers.
- Share pure microtimed event expansion between playback and export; rearticulate held MIDI notes on seek/loop with remaining durations. Clamp loop/seek boundaries to the score, reject invalid positions and clean up startup scheduling errors. Keep gesture-triggered audio startup free of database waits.
- Tap kick keys after the user fader/mute and before the solo output gate. A soloed sidechain destination retains its kick detector while the audible kick output remains suppressed. Changing the kick instrument disconnects its detector taps.

- Repair offline export failure handling: scheduling/suspend/resume/processor errors fail the job, initial setup tears down the graph, and every registered suspension can drain after an abort. Keep a single export lease until native rendering settles, including after cancellation.
- Encode and independently verify PCM in bounded asynchronous chunks with cancellation checkpoints and per-stage progress; retain byte-identical 16/24/32-bit encoding semantics. Validate native frame count/format before encoding and emit COMPLETED/FAILED/CANCELLED only from the export boundary.
- Capture export project/options and download filename so later edits/format selection cannot relabel or change an in-flight file. Prevent duplicate starts and ignore modal callbacks after unmount. Detect automated reverb sends when requiring true sidechain keys in playback/export.

## Evidence

`npm run check` passed with strict TypeScript, 85 tests across sixteen files, and the Vite 7.3.7 production build. `npm audit --json` reported zero vulnerabilities after upgrading Vite to 7.3.7 and its esbuild dependency to 0.28.2. Node v24.22.1 and npm 11.9.0 were used. The suite includes a 200-project exact-duration corpus (8 styles × 5 durations × 5 seeds), plus command, persistence, regeneration, scheduler, WAV and sidechain-kernel regression cases. Sidechain tests execute the actual processor source with a test AudioWorklet host; they are not browser/audio-device measurements. Scheduler tests isolate event/parameter semantics, not full real-time performance. New IndexedDB tests use fake-indexeddb and cover transaction rollback on quota failure, stale writers, corruption, first-checkpoint recovery, future formats, missing heads, retention, hydration and explicit conflict recovery. Graph tests use a test Web Audio host to inspect actual connection topology; they do not measure native audio signals. Export pipeline tests use a deferred test OfflineAudioContext with controlled suspensions/resumes and synthetic PCM to exercise orchestration, failure, cancellation, cleanup, terminal states, snapshot isolation, and overlapping-render rejection. Async WAV tests compare bytes/decoded metrics against the synchronous routines for all three formats, test cancellation after task yields, and reject late nonfinite PCM. Synthetic PCM is not evidence of audible synthesis or native renderer correctness.

Failing tests were recorded before the relevant repairs, including the broken imports, invalid transactions, duplicate/missing IDs, locked-span edits, replay-ID drift, incomplete articulation diffs, antiphase detector cancellation, wrong duration, dropped duplicate-family tracks, nonfinite/float/integer WAV defects, deleted automation, crossing-clip loss, negative microtiming and event-expansion limits. This increment also recorded failing first-checkpoint corruption recovery and lower-revision divergent-local recovery tests before fixing those defects. Export tests also reproduced a scheduling stall, swallowed suspend failure, setup cleanup omission, ignored cancellation and missing terminal states. Review-driven failing tests reproduced unattended future suspension after a resume failure, overlapping cancelled-native render buffers, and missing automated-return sidechain detection; these cases now pass.

## Gate ledger

| Gate | Status | Remaining qualification |
|---|---|---|
| G0 build/startup | BLOCKED | Typecheck/build and domain tests PASS; visible runtime startup still needs browser access |
| G1 project integrity | BLOCKED | Command/snapshot and IndexedDB atomicity/conflict/fault semantics tested; real browser storage/crash journeys remain |
| G2 editing/automation | BLOCKED | Tested scheduler cancellation and protected edits; MIDI chase and bounded loop semantics tested; actual control/audio journeys and rendered seek/loop signals remain |
| G3 musical composition | BLOCKED | Exact-duration corpus and variable inventories tested; reference-conditioned generation and producer listening remain |
| G4 synth/effects | BLOCKED | Existing synthesis preserved; complete device registry/FM/wavetable/sampler/racks/effect suite and signal qualification remain |
| G5 routing/sidechain | BLOCKED | Antiphase kernel regression fixed; key-solo/tap topology tested; native browser signals, arbitrary routing/per-destination controls remain |
| G6 playback reliability | BLOCKED | Scheduling/startup/cleanup repairs made; captured playback, long-load and device lifecycle evidence remain |
| G7 export | BLOCKED | WAV byte and controlled export-lifecycle/failure tests pass; native full mix renders, ranges/stems/MIDI/ALS, OS saving and measured cancellation latency remain |
| G8 cross-platform | BLOCKED | No Android project, APK install, phone/tablet/fold or PWA upgrade evidence |

## Explicit limitations

The cloud browser cannot reach the workspace loopback preview; a shared-file navigation attempt was rejected by browser URL policy. No browser policy workaround was attempted. No screenshot/interaction/audio qualification is claimed.

No Qodo managed tools or executable, Autonom CLI, adb or Android target is available in this execution environment. Code review includes separate standards and spec agents plus the implementing agent's source/test assessment. Their three actionable lifecycle/sidechain findings were fixed with regression tests; this is not an independent Qodo review. No APK was built or installed. Main should not be merged on a claim of production readiness.

IndexedDB now atomically commits the current score and a typed command journal, retaining a previous valid snapshot and quarantining damaged heads when replaced. Journal retention is 256 entries or a soft 8 MiB budget (the newest complete entry is retained even if larger; records are limited to 32 MiB). SHA-256 checks detect corruption; they are not authenticity guarantees. Recovery uses the latest verified checkpoint or replays the latest command against the previous valid score. Missing heads/future versions are preserved and reported rather than reset. Earlier journal prefixes may be pruned: this does **not** restore the full undo stack across sessions. Undo/redo history remains bounded in memory. LocalStorage snapshots remain the synchronous fallback for page exit and unsupported database environments. Divergent fallback/database scores require an explicit choice, even when one revision counter is lower. Real browser save/reopen, termination during transactions, quota and recovery UI journeys remain unqualified.

MIDI chase rearticulates held notes with the remaining duration. It does not reconstruct oscillator/envelope phase or prior delay/reverb tails. Sidechain keys are post-fader/mute and pre-solo; muting the kick intentionally removes its key. Routing still uses the existing three destination groups, not arbitrary per-track external keys. The scheduled-envelope fallback remains a disclosed degraded mode, and export still refuses required-worklet failure by default.

Automation generation is retained conservatively when any section is locked, rather than changing interpolation through protected spans. Full per-span automation regeneration still needs the target-addressed lane/curve extension. Global tempo/production-mode changes are not section-local locks.

Variable inventories and manual same-family tracks are an initial layer-identity increment, not the complete versioned LayerDescriptor architecture or a measured musical-quality improvement. The current source has not been compared anew against the six external reference ALS files.

The master DynamicsCompressor is not a qualified true-peak limiter; the meters are not LUFS. WAV byte inspection verifies the generated download data, not a user's disk write, loudness compliance or live/offline audio parity. A float WAV may retain values beyond unity. Integer formats clip to their defined range. The render adds the existing four-second tail; configurable tails and aligned stems remain open. Encoding and verification yield between bounded PCM chunks, but allocation, project validation/cloning, impulse generation and native rendering still require real-device timing/memory measurements. Cancellation rejects the job and disconnects sources; native OfflineAudioContext rendering cannot be forcibly closed, so it drains while a lease prevents overlapping export allocations. If native resume permanently fails, retries remain blocked until reload. This is a disclosed browser API limitation, not a tested device recovery guarantee. “Completed” means verified bytes ready to download, not verified storage on disk. The 256 MiB PCM budget excludes graph/assets/encoded copies, so real device memory budgets still require measurement.

## Next integration gate

Obtain real browser playback/render evidence for this exact branch, resolve any runtime faults, then complete the remaining persistence/automation/device work. Android packaging and further sound-engine features stay behind the approved playback/export qualification gate. Keep each later increment and its evidence separate; do not mark G0–G8 PASS from these unit checks.
