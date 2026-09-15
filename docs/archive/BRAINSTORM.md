# StudyFocus — Brainstorm

> A "lock in" app: you commit to a focus session, and the apps that pull you away
> stop being available until the session ends.

Status: **brainstorming** — nothing built yet. Open questions at the bottom.

---

## 1. The core loop

```
Pick what to block  →  Pick how long  →  Commit (lock in)  →  Session runs  →  Session ends
                                              ↑                    │
                                              └──── can you quit? ─┘
```

The whole product lives or dies on that last arrow. Everything else is UI.

---

## 2. The hard truth about "blocking apps"

Actually preventing an app from opening is an **OS-level privilege**. This shapes the
entire project more than any design choice, so it goes first.

| Platform | What's technically possible | What it costs |
|---|---|---|
| **iOS** | Real blocking via Apple's **Screen Time API** (`FamilyControls` + `ManagedSettings` + `DeviceActivity`). Shields apps with a system overlay. | Native Swift/SwiftUI only. Needs a paid Apple Developer account ($99/yr) and Apple must approve the `com.apple.developer.family-controls` entitlement. No React Native/Flutter shortcut that works well. |
| **Android** | Real blocking via `UsageStatsManager` + an `AccessibilityService` that detects the foreground app and slams an overlay over it. | Kotlin. Scary-looking permission prompts. Play Store policy scrutiny. |
| **macOS/Windows** | Block *websites* via hosts file / DNS / a proxy; kill or refuse to launch processes. | Needs admin rights. Easy to undo if you know how. |
| **Web app** | Cannot block anything outside the browser tab. Full stop. | — |

**The honest framing:** a browser-based prototype can nail the *product* — the commitment
mechanics, the timer, the streaks, the psychology — but it can't be the shipping product
for phone blocking. The realistic path is: prototype the experience in a fast medium,
validate that the mechanics feel right, then port the shell to native for the one job
only native can do.

---

## 3. Commitment strength — the actual design problem

Every focus app has a timer. The differentiator is what happens when you want to bail
at minute 4. Options, weakest → strongest:

1. **Honor system** — tap "end session", it ends. Useless for anyone who needs it.
2. **Friction** — a confirmation, a 10-second countdown, type a sentence to quit.
3. **Cost** — quitting breaks a streak, loses points, forfeits earned currency.
4. **Cooldown** — you *can* quit, but you can't start a new session (or unblock) for N minutes.
5. **Social** — an accountability partner gets notified, or must approve the unlock.
6. **Hard lock** — no unlock exists until the timer expires. Strongest, and genuinely
   dangerous if a real emergency arrives.

**Design principle worth holding:** never block the phone dialer, messages, or maps.
Every hard-lock app that ignored this has a one-star review about a missed emergency.

There's also a spectrum of *breakability* worth being deliberate about: can the user
delete the app to escape? (Screen Time can block Settings, which is intense.) The
sweet spot for most people is probably **friction + cost**, with hard lock as an
opt-in "extreme mode."

---

## 4. Feature surface (candidates, not commitments)

**Table stakes**
- Blocklist / allowlist of apps and websites
- Session duration picker + a running timer that survives backgrounding
- Shield screen when you try to open a blocked app ("You're locked in. 23 min left.")
- Session history

**Differentiators worth considering**
- **Profiles** — "Deep Work," "Homework," "Sleep" — each with its own blocklist and default length
- **Scheduled locks** — recurring: every school night 7–9pm, auto-arm
- **Pomodoro mode** — blocks during work intervals, opens the gates during breaks
- **Streaks + stats** — hours locked in this week, longest session, best day
- **Task binding** — attach a specific goal to the session; on completion, log what you did
- **Location/wifi triggers** — auto-arm when you arrive at the library
- **Emergency passes** — N per week, so the escape hatch is finite instead of free
- **Body doubling / group sessions** — friends locked in at the same time (this is the
  one thing that makes it social rather than punitive)

**Deliberately out of scope for a prototype:** parental controls, multi-device sync,
monetization.

---

## 5. Prototype strategies

**A — Web prototype (React + Vite), simulated blocking**
Fastest to something clickable. A fake "phone home screen" of app icons; tapping a
blocked one shows the shield. All the commitment mechanics are real; only the OS
enforcement is simulated. Good for feeling out the design; useless as a real tool.

**B — Web app that really blocks websites**
Pair the web app with a browser extension. Genuinely useful on a laptop, genuinely
useless for phone distraction — which is where the problem actually is.

**C — Native iOS (SwiftUI + Screen Time API)**
The only version that solves the stated problem for real. Slower to build, needs an
Apple Developer account, entitlement approval, and a physical device to test.

**D — Web prototype now, structured as a portable spec**
Build A, but keep the session/blocking logic in a clean, framework-agnostic core so
the state machine ports to Swift or Kotlin later rather than being thrown away.

---

## 6. Open questions

- Which platform is this actually *for* — your iPhone, your Mac, or both?
- How strong should the lock be? Is an escape hatch a feature or a bug?
- Solo tool for you, or something other people would use?
- Does it connect to studying specifically (subjects, assignments, sessions logged
  per class) or is it a general-purpose focus tool?
- Prototype now for the feel, or start on the real native thing immediately?

---

## 7. Decisions

**Platform: local macOS, real app blocking.** Not a browser toy and not just websites —
it terminates actual Mac applications. Runs entirely on this machine, no accounts, no
cloud, no App Store. Enforcement is a local Node daemon that scans running processes
once a second and kills anything on the blocklist.

**Lock: hard, no exit.** There is deliberately no "end session" endpoint in the API and
no quit button in the UI. Session state is persisted to `~/.studyfocus/`, so killing the
daemon and restarting it *resumes* the lock rather than clearing it. Honest ceiling: a
determined user with a terminal can `kill` the daemon and delete the state file. Making
that impossible needs root and a `launchd` daemon — a real option later, noted in §8.

**Never blockable.** A protected list the UI refuses to add: Finder, System Settings,
Terminal/iTerm, Activity Monitor, Messages, FaceTime, Maps, Phone. Emergencies beat
focus, always.

**Scope: general focus tool.** Sessions are just sessions. Optional free-text label
("chem problem set") for the history, but no subject/assignment model.

**Features in the prototype:** core timer + blocklist, **Pomodoro mode**, and
**streaks + stats**. Skipped for now: profiles, scheduled auto-lock, social.

---

## 8. How enforcement actually works

```
every 1000ms
  │
  ├─ ps -Axo pid=,args=          → every running process + its executable path
  ├─ map each path to its outermost .app bundle
  ├─ intersect with the session blocklist
  │
  └─ for each match:  SIGTERM  →  still alive 3 ticks later?  →  SIGKILL
                        │
                        └─ macOS notification: "Blender is blocked — 23 min left"
                        └─ logged to the live session feed in the UI
```

Uses `ps` rather than AppleScript/`System Events` on purpose: no Automation or
Accessibility permission prompt, nothing to approve, works the moment you run it.

**Pomodoro interacts with enforcement directly:** blocking is armed during work phases
and disarmed during breaks. Total session length is `rounds x work + (rounds-1) x break`
— no trailing break.

**Known limits of this prototype**
- Kills apps rather than preventing launch. The app flickers open for up to a second
  before dying. Preventing launch outright needs Apple's Screen Time API + entitlement.
- Blocks apps, not websites. Blocking a site means killing the whole browser, which is
  too blunt; a browser extension is the right tool for that and is a separate build.
- The daemon is killable. `launchd` with `KeepAlive` would make it respawn instantly —
  the natural next step if the lock isn't holding.
