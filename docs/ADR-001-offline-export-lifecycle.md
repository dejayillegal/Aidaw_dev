# Offline export failure and resource ownership

Status: implemented in this branch; native runtime qualification pending. Date: 6 November 2026.

The approved safe-refactor requirements prioritize correct playback/export, bounded resource use, visible errors and cancellation while preserving the shared Web Audio graph and scheduler. The previous suspend callbacks swallowed scheduling errors and could leave a renderer suspended or accept an incomplete score.

## Decision

The implementation keeps the shared graph/scheduler and uses one future suspension at a time. Every scheduling, suspend, resume or processor error rejects the export. Teardown covers initial automation and window setup. Abort-aware pause handlers resume any already registered future suspension after the scheduling pump exits.

A single export lease is acquired before native context allocation and retained until both the application job exits and native rendering settles. Cancellation can reject the application job promptly while native rendering drains with its graph disconnected. A retry cannot allocate another export context during that drain. Persistent native resume failure keeps the lease held and produces an actionable retry/reload error.

PCM encoding and verification share the synchronous byte semantics but process bounded chunks with task yields and cancellation checks. The caller receives a captured score/format and a terminal state only after independent format/frame/PCM checks. Automated return sends participate in sidechain requirements.

## Alternatives and consequences

| Approach | Benefit | Limitation |
|---|---|---|
| Retain swallowed callback failures | Small diff | Can hang or verify an incomplete score; rejected |
| Schedule the complete arrangement before rendering | Avoid suspend callbacks | Can allocate all voices at once; exceeds the intended bounded-window design |
| Rolling suspension with explicit ownership | Preserves existing graph, bounds pending scheduling and overlapping contexts | Native drain still owns its output buffer; permanent resume failure requires reload |

The Web Audio API defines offline suspend/resume and rendering completion, but no offline close/abort method: [W3C Web Audio API, OfflineAudioContext](https://www.w3.org/TR/webaudio-1.0/#OfflineAudioContext). The implementation therefore does not simulate immediate native cancellation. It does not add a new audio backend or upload any project data.

Controlled-host tests verify orchestration, not native signal parity, wall-clock cancellation latency or device memory limits. Native browser rendering, modal interaction, OS file saving and Android lifecycle qualification remain open. Revisit this decision when a qualified chunked/native backend can release render allocations directly. Engineering follow-up belongs to this repository's playback/export qualification work; no individual owner is assigned by this record.
