# Developing StudyFocus

StudyFocus is an unsigned macOS beta. Read the README and release notes before
changing its enforcement or distribution behavior.

## Setup

Use macOS 13 or later, Node.js 24, npm, and Xcode Command Line Tools. Run `npm ci`,
then `npm run native` and `npm run build`. `npm run dev` launches the desktop
application with the development renderer. Use isolated test data for development;
normal app sessions may close selected applications and enforce website rules.

## Validation

- `npm test`: core and extension-rule tests. Native-protocol tests require the
  compiled native helper and otherwise report skips.
- `npm run typecheck`: shared TypeScript declarations, not a full JavaScript audit.
- `npm run build`: production renderer build.
- `npm run test:desktop`: GUI integration with isolated, clearly labeled simulation.
- `node scripts/test-macos.mjs`: closes a disposable test app and verifies an isolated
  LaunchAgent using a previously packaged Apple Silicon app. Requires a logged-in
  macOS desktop session. Never substitute a user's working app as the target.
- `node scripts/test-chrome.mjs`: real extension/native integration in a temporary
  browser profile; requires `npx playwright install chromium` first.

The integration scripts do not modify the user's normal Chrome profile or production
background-service registration. Do not activate optional live hosts enforcement
as part of routine tests.

## Changes

Keep session decisions and validation in the engine. Renderer code uses the narrow
API in `src/api.js`; it must not manipulate persistence or privileges directly.
Preserve emergency recovery, protected application identities, and honest reporting
of missing enforcement. Add regression coverage when changing those behaviors.

Use a branch and describe the user-visible change, validation, and remaining
limitations in pull requests. Never commit credentials, signing identities, local
session data, dependencies, or generated installers. Put distributable installers
in GitHub Releases rather than ordinary Git commits.

No open-source license is currently selected. Adding a license or changing public
distribution policy is the owner's decision.
