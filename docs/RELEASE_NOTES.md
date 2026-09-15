# StudyFocus 1.0.0-beta.1

This renovation replaces the terminal/browser prototype with a downloadable macOS application. Everyday operation uses the app window and menu bar. The release includes Focus and Pomodoro sessions, protected application selection, Chrome website blocking, strict commitments with emergency unlock, reusable profiles, recurring weekly schedules, history, JSON export, legacy import, and light/dark appearance.

## Download and setup

Use the Apple Silicon DMG for M-series Macs or the Intel DMG for Intel Macs. Both target macOS 13 or later. Drag StudyFocus into Applications before opening it or configuring its background service and Chrome connector. See USER_GUIDE.md for the complete setup.

These are **unsigned local beta builds**, not a finished public distribution. No Developer ID signing identity was available. Gatekeeper may require normal per-app approval or prevent opening an unsigned download. Do not disable Gatekeeper or other system protections. A public release needs Developer ID signing, notarization, and final clean-Mac installation checks.

Chrome website blocking requires the bundled companion extension. Install the connector in Settings, then use Open extension and Chrome's Developer mode / Load unpacked flow. A standalone extension ZIP is included for convenience. Public one-click installation needs Chrome Web Store publication; no listing has been published. Incognito requires its separate extension permission. Chrome profiles without the extension are outside its coverage.

The optional System website blocking setting uses an administrator-approved hosts helper for exact hostnames and their www variants. Chrome supplies broader subdomain coverage. Keep this optional setting off for initial beta evaluation: its text transformation and native protocol are tested, but an administrator-approved live /etc/hosts cycle was not run on this Mac.

## Validation on the development Mac

- 27 automated core, Chrome-rule, and compiled-native tests passed. They cover duration/domain validation, session boundaries, serialized starts, schedule conflicts and missed starts, emergency outcomes, migration, corrupt-store preservation, host text preservation, framed native messages, and offline recovery.
- Real macOS enforcement closed a disposable test application and left it available after emergency unlock. Canonical identity and protected-app spoof checks passed.
- An isolated LaunchAgent started the packaged service and restarted it after SIGKILL. The production registration falls back to a per-user LaunchAgent when SMAppService is unavailable.
- The packaged Apple Silicon application passed graphical onboarding, all five views, profile and schedule creation, modal keyboard containment, session confirmation, emergency unlock, dark appearance, and the minimum 860 × 650 window size. UI tests use clearly labeled simulation mode; the separate native and Chrome integration tests use real enforcement.
- Real Chrome integration passed native messaging, session rule acknowledgement, exact/subdomain matching, deceptive sibling rejection, blocked-page navigation, emergency cleanup, stale-rule cleanup after browser restart, offline emergency Chrome cleanup, and reconciliation after engine restart.
- The Vite production build, shared TypeScript declaration check, and Git whitespace check passed.
- Apple Silicon and Intel DMGs were produced; the native helper contains both architectures. Only Apple Silicon execution was tested. Minimum-supported-macOS and Intel runtime checks, full logout/reboot checks, notification delivery, and signed/notarized installation remain release validation work.

## Recovery and behavior

Closing or quitting the window leaves the focus engine running. Enable the background service for login and crash recovery. Sleep does not extend a commitment. Missed scheduled starts are recorded rather than replayed as late locks; profile edits apply to future commitments.

Emergency unlock records an emergency outcome before releasing the rules. A pending-cleanup banner means a blocking component has not yet acknowledged release; keep Chrome open or reconnect it. If the engine is unavailable, the connection banner offers Emergency recovery with a native confirmation. It preserves the data files, places a recovery marker that the Chrome bridge and hosts helper can see, and reconciles the emergency outcome when the engine recovers. Unreadable state files are preserved rather than silently replaced. Repair cannot automatically reconstruct an unrecoverable corrupt database; restore a valid backup.

Strict mode is a commitment mechanism, not an administrator-proof security boundary. Removing or disabling the Chrome extension, killing services, changing system time, or using an unconnected browser can affect enforcement. The interface reports detected failures; it does not promise complete tamper resistance.

## Source and ownership

The original source was backed up before renovation and retained as the baseline Git commit. Astra handled architecture, scaffolding, the engine, native helpers, Chrome integration, packaging, and verification. Bounded UI, documentation, and test work was delegated to Terra and Luna, then integrated and checked by Astra. No accounts were purchased and no store listing was published.
