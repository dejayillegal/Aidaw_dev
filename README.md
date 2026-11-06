# AIDAW

AIDAW is a browser-based, AI-assisted techno digital audio workstation built with React, TypeScript, and Vite. Its intended workflow brings composition, arrangement editing, inspection, and AI-assisted proposals into one workspace, with synthesis and effects powered by the Web Audio API.

## Project status

This repository is the source for the web application. The current package scripts expose Vite development, build, and preview commands. The recovery branch restores the previously damaged core modules and adds command/snapshot validation, regression tests, variable style inventories and audio/export safety fixes. Strict type checking, automated domain tests and the production build have been run; browser playback, complete WAV rendering and Android operation remain unqualified. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for exact evidence and remaining gates.

There is no checked-in Capacitor Android project or debug APK at this time. Android packaging is a planned integration and must not be described as complete until the Android project builds and is tested on target devices.

## Requirements

- Node.js and npm compatible with the project's Vite/TypeScript dependencies
- For Android packaging: Java JDK, Android SDK, and Gradle/Android Studio in addition to the web requirements

## Web development

```sh
npm install
npm run dev
```

Build and preview:

```sh
npm run build
npm run preview
```

`npm run build` runs `vite build`. Run the complete software checks with `npm run check` (strict TypeScript, Vitest, production build), or use `npm test` and `npm run typecheck` individually. These checks do not replace real browser/audio/device qualification. Offline exports now propagate scheduling failures and support cooperative cancellation through PCM encoding/verification. A cancelled native render may need to drain before another export can start; completed exports are verified downloads, not confirmed disk writes.

## Projects and recovery

The Project menu can download a validated `.aidaw.json` backup and open a saved project after confirmation. Autosave keeps checksummed current/previous snapshots and preserves original legacy data. Save errors are displayed; keep explicit backups of important work. IndexedDB commits each score and typed journal entry atomically, checks SHA-256 integrity, and rejects stale-window writes. The Project menu can review database recovery or explicitly keep divergent local edits. LocalStorage snapshots remain a fallback. The bounded journal supports recovery, but the full undo stack is not restored across sessions. Browser storage/crash behavior still needs qualification.

## Android packaging (planned)

The intended first Android milestone is a Capacitor wrapper around the existing web application, with the web bundle packaged locally. The following commands apply only after Capacitor configuration and Android platform scaffolding have been added and verified:

```sh
npm install
npm run build
npx cap init
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

A successful Gradle build is not device qualification. Verify install/startup, audio focus and interruptions, file export, and phone/tablet behavior on actual Android targets. Background playback is not supported unless a separately tested native media-service integration is implemented.

## Architecture and preservation

Keep the existing composition and audio behavior intact when changing the application. In particular, preserve the unified workspace, composition grammar and multi-section arrangement, transition atoms, shared playback/export scheduling and graph, and genuine sidechain processing. Avoid replacing the arrangement generator with a simpler loop generator.

See [AGENTS.md](AGENTS.md) for change-safety guidance and [SKILLS.md](SKILLS.md) for common repository workflows and verification expectations.

## Evidence and release gates

Report each verification gate as **PASS**, **FAIL**, **BLOCKED**, or **NOT TESTED**, with the command/device/build identity and evidence. Network/toolchain restrictions must be recorded as blocked, not passed. A successful build alone does not qualify audio behavior, Android reliability, or the complete user journey.
