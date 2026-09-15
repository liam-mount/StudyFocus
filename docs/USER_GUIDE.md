# StudyFocus user guide

StudyFocus keeps focus commitments local to your Mac. It is currently a beta, so the
Chrome setup and macOS service registration include development and approval steps.

## Install and open StudyFocus

1. Open the StudyFocus DMG.
2. Drag StudyFocus to Applications.
3. Open StudyFocus from Applications and complete the welcome screen.

This beta does not have an Apple signing identity. macOS may show its standard
security approval when the app is opened. A public release will add signing and
notarization. Do not weaken macOS security settings to install the app.

## Start a focus commitment

1. Open Focus.
2. Choose Focus for one continuous block, or Pomodoro for repeated work rounds and
   breaks.
3. Enter the work length. Pomodoro also asks for a break length and number of rounds.
4. Use the app picker to add applications. Protected macOS and StudyFocus processes
   cannot be selected for blocking.
5. Add website domains when browser blocking is part of the commitment.
6. Review the summary and confirm the commitment.

Focus runs for the committed duration. Pomodoro calculates total time as:

```text
rounds × work + (rounds - 1) × break
```

There is no trailing break. App enforcement is armed during work rounds and released
during breaks. Closing the StudyFocus window does not end the session.

### Add websites

Enter a domain such as `youtube.com`. StudyFocus normalizes website entries before
starting. Chrome coverage is handled by the extension. System website blocking can
also apply exact domains across browsers when enabled in Settings; the macOS helper
asks for administrator approval when the session starts.

System website blocking is not an attention sensor. History's verified enforcement
time reports blocker coverage, not whether you were paying attention.

## Chrome setup

The beta extension is not published in the Chrome Web Store. Use the local extension
path:

1. Open Settings in StudyFocus.
2. Choose Install Chrome connector. This installs the local native-messaging host
   registration for the StudyFocus app.
3. Choose Open extension. StudyFocus opens the bundled `chrome` directory and shows
   the local setup instructions.
4. In Chrome, open `chrome://extensions`.
5. Turn on Developer mode.
6. Choose Load unpacked and select the `chrome` directory.
7. If Incognito coverage is needed, open the extension's Details and enable Allow in
   Incognito.

The Settings page lists connected Chrome profiles, their recent heartbeat, revision,
errors, and Incognito coverage. A website commitment requires a connected Chrome
profile in normal packaged operation. The extension uses local native messaging; it
does not send your history to a hosted service.

Public installation will use a signed/notarized app and a Chrome Web Store listing.
The local Load unpacked path is for this beta and local testing.

## Profiles

Open Profiles to save a reusable setup. A profile contains:

- a name and color;
- Focus or Pomodoro mode;
- work, break, and round settings;
- selected apps and websites.

Saving a profile resolves and validates its selected apps. A profile can be edited or
deleted after schedules that use it are removed.

## Schedules

Open Schedule to choose a profile, weekdays, time, and whether the schedule is
enabled. The engine rejects overlapping enabled schedules and rejects a new session
that would run into an upcoming scheduled commitment.

When StudyFocus is unavailable around a scheduled start, it records a `missed` entry
and does not replay the start. A start that fails because another session is active,
its profile is unavailable, or setup cannot complete is recorded as `failed` with a
reason in History.

## During a session and emergency unlock

The active view shows the current phase, remaining time, blocked targets, and
intercepted app events. During Pomodoro breaks, app and website enforcement is
released until the next work round.

To end a session early, choose Emergency unlock and confirm. StudyFocus then:

- records an `emergency` history entry;
- clears app enforcement;
- reconciles the Chrome connector;
- releases System website blocking and cleans its managed rules.

If website cleanup or the system helper needs attention, open Settings and choose
Repair. The engine can reject service removal while a session, pending cleanup, or
enabled schedule still requires the background service.

## History

History shows Today, 7 days, streak, and completed-session totals. The 14-day view
can be read as a chart or table. Filter the session log by profile or outcome, then
expand a session for its outcome, focused time, verified enforcement time, and block
count.

Committed/focused time is the time the session was designed to spend working.
Verified enforcement is the time the app could verify its blockers were active. It is
not a measurement of attention.

Use Export data to create a portable JSON copy through the system save dialog.

## Settings

Settings provides:

- System, Light, or Dark appearance;
- notification enablement;
- background service install, repair, status, and uninstall;
- Chrome connector installation and local extension instructions;
- optional System website blocking;
- legacy migration when legacy data is detected;
- data export and the local data folder.

System website blocking is disabled while a session is active. When enabled, it uses
the bundled macOS helper for exact domains across browsers and may ask for an
administrator password at session start. Chrome supplies full subdomain coverage.

The background service uses `SMAppService` where available and a per-user LaunchAgent
fallback in this unsigned beta. Uninstall requires ending the active session,
finishing pending website cleanup, and disabling enabled schedules first.

## Local data and migration

StudyFocus stores current data at:

```text
~/Library/Application Support/StudyFocus/
```

This includes local settings, profiles, schedules, session state, history, service
communication files, and optional System website helper status. The app has no account
requirement and keeps focus data local unless you export it.

If StudyFocus detects legacy data under:

```text
~/.studyfocus/
```

Settings offers Import legacy data. The import validates the old history, backs up
the old `history.json`, `prefs.json`, and `session.json` files beside the new data,
imports history with the `legacy` outcome, and may create an Imported setup profile
from the previous preferences. Protected or unavailable apps are omitted and
reported. An old active session must be finished in the original StudyFocus before
migration.

## If something needs repair

- If the background service is unavailable, open Settings and choose Repair.
- If Chrome is disconnected, open the extension popup and choose Reconnect, then
  confirm that the local native-messaging host was installed from Settings.
- If System website rules need attention, use Repair in Settings. The helper clears
  only StudyFocus's marked rules and leaves unrelated hosts-file content alone.
- If a scheduled start was missed, check History for its recorded reason; StudyFocus
  does not replay missed commitments automatically.

## Beta boundaries

This release has no signing identity, no notarization, and no published Chrome Web
Store extension. The local DMG, background registration approval, and Chrome Load
unpacked flow are the supported beta path. Release notes will record final validation
evidence as it becomes available.

## If the engine cannot connect

Use **Emergency recovery…** in the connection banner to request an emergency unlock
through the native helper. Confirm the macOS dialog, keep Chrome open, and then use
Repair connection. The recovery marker preserves your files and allows browser rules
to clear without a working engine. History is reconciled when the engine recovers.
If both state and its backup are unreadable, they remain preserved for manual recovery.

See RELEASE_NOTES.md for tested behavior and the remaining public-release requirements.
