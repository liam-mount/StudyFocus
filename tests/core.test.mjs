import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { Engine } from '../engine/core.mjs'
import { Repository } from '../engine/store.mjs'
import { durationMin, nextRun, scheduleConflict, setup } from '../engine/rules.mjs'
import { hostVariants, normalizeDomain } from '../shared/domains.js'

const APP = {
  id: 'test.editor',
  name: 'Test Editor',
  bundleId: 'test.editor',
  bundlePath: '/Applications/Test Editor.app',
  protected: false,
}

const localTime = (year, month, day, hour, minute = 0, second = 0) =>
  new Date(year, month - 1, day, hour, minute, second, 0).getTime()

function platform() {
  return {
    simulation: true,
    strikes: new Map(),
    apps: async () => [APP],
    resolve: async (targets) => targets,
    enforce: async () => [],
  }
}

function input(overrides = {}) {
  return {
    mode: 'focus',
    workMin: 30,
    breakMin: 5,
    rounds: 1,
    apps: [APP],
    sites: [],
    ...overrides,
  }
}

function harness(t, start = localTime(2026, 1, 5, 9)) {
  const dir = fs.mkdtempSync('/tmp/studyfocus-core-')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  let now = start
  const repo = new Repository(dir)
  const engine = new Engine(repo, platform(), { clock: () => now, legacyDir: path.join(dir, 'legacy') })
  return {
    dir,
    repo,
    engine,
    now: () => now,
    setNow: (value) => { now = value },
    advance: (milliseconds) => { now += milliseconds },
  }
}

test('domain normalization rejects unsafe input and preserves hostname boundaries', () => {
  assert.equal(normalizeDomain(' HTTPS://www.YouTube.com/feed?q=1 '), 'youtube.com')
  assert.equal(normalizeDomain('m.youtube.com'), 'm.youtube.com')
  assert.equal(normalizeDomain('notyoutube.com'), 'notyoutube.com')
  assert.deepEqual(hostVariants('youtube.com'), ['youtube.com', 'www.youtube.com'])

  for (const value of [
    '', 'localhost', 'http://localhost:3000', 'http://127.0.0.1', 'https://10.0.0.1',
    'file:///etc/hosts', 'ftp://example.com', 'https://user:secret@example.com',
    'example.local', 'example.internal', 'exa mple.com', 'https://[::1]',
  ]) assert.equal(normalizeDomain(value), null, value)
})

test('setup validates strict duration bounds and computes focus and Pomodoro duration', () => {
  assert.equal(durationMin(setup(input({ workMin: 480 }))), 480)
  assert.equal(durationMin(setup(input({ mode: 'pomodoro', workMin: 25, breakMin: 5, rounds: 4 }))), 115)

  assert.throws(() => setup(input({ workMin: 0 })), /Focus minutes must be a whole number/)
  assert.throws(() => setup(input({ workMin: 480.5 })), /Focus minutes must be a whole number/)
  assert.throws(() => setup(input({ mode: 'pomodoro', workMin: 181, breakMin: 5, rounds: 1 })), /Focus minutes must be a whole number/)
  assert.throws(() => setup(input({ mode: 'pomodoro', workMin: 25, breakMin: 0, rounds: 4 })), /Break minutes must be a whole number/)
  assert.throws(() => setup(input({ mode: 'pomodoro', workMin: 25, breakMin: 5, rounds: 13 })), /Rounds must be a whole number/)
  assert.throws(() => setup(input({ sites: ['localhost'] })), /Invalid website/)
})

test('focus and Pomodoro sessions expose correct phases and end boundaries', async (t) => {
  const focus = harness(t)
  await focus.engine.dispatch('start', input({ workMin: 10 }))
  assert.equal(focus.engine.snapshot().session.phase, 'work')
  focus.advance(10 * 60_000)
  assert.equal(focus.engine.snapshot().session.phase, 'done')
  await focus.engine.tick()
  assert.equal(focus.repo.data.history.at(-1).outcome, 'completed')
  assert.equal(focus.repo.data.history.at(-1).focusedMs, 10 * 60_000)

  const pomodoro = harness(t, localTime(2026, 1, 6, 9))
  await pomodoro.engine.dispatch('start', input({ mode: 'pomodoro', workMin: 25, breakMin: 5, rounds: 3 }))
  pomodoro.advance(25 * 60_000)
  let session = pomodoro.engine.snapshot().session
  assert.equal(session.phase, 'break')
  assert.equal(session.round, 1)
  pomodoro.advance(5 * 60_000)
  session = pomodoro.engine.snapshot().session
  assert.equal(session.phase, 'work')
  assert.equal(session.round, 2)
  pomodoro.advance(55 * 60_000)
  assert.equal(pomodoro.engine.snapshot().session.phase, 'done')
})

test('weekly schedule conflicts account for commitments wrapping Sunday into Monday', () => {
  const profiles = [
    { id: 'long', mode: 'focus', workMin: 90, breakMin: 5, rounds: 1, apps: [APP], sites: [] },
  ]
  const schedules = [
    { id: 'late-sunday', profileId: 'long', enabled: true, days: [0], time: '23:30' },
    { id: 'early-monday', profileId: 'long', enabled: true, days: [1], time: '00:15' },
  ]
  assert.deepEqual(scheduleConflict(schedules, profiles), ['late-sunday', 'early-monday'])
})

test('nextRun chooses the next matching future occurrence, including next week at an exact time', () => {
  const now = localTime(2026, 1, 5, 9, 0) // Monday in the local timezone
  const monday = new Date(now).getDay()
  const schedule = { enabled: true, days: [monday], time: '09:00' }
  const expected = new Date(now)
  expected.setDate(expected.getDate() + 7)
  assert.equal(nextRun(schedule, now), expected.getTime())

  const laterToday = { enabled: true, days: [monday], time: '09:01' }
  assert.equal(nextRun(laterToday, now), localTime(2026, 1, 5, 9, 1))
  assert.equal(nextRun({ ...laterToday, enabled: false }, now), null)
})

test('concurrent starts are serialized and commit exactly one strict session', async (t) => {
  const { engine, repo } = harness(t)
  const results = await Promise.allSettled([
    engine.dispatch('start', input({ label: 'First' })),
    engine.dispatch('start', input({ label: 'Second' })),
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /strict session is already running/)
  assert.equal(repo.data.session.label, 'First')
  assert.equal(repo.data.history.length, 0)
})

test('emergency release records partial focused time and clears the session', async (t) => {
  const { engine, repo, advance } = harness(t)
  await engine.dispatch('start', input({ workMin: 30, label: 'Draft' }))
  advance(11 * 60_000)
  await engine.dispatch('emergency')

  assert.equal(repo.data.session, null)
  assert.equal(repo.data.history.length, 1)
  assert.deepEqual(
    { outcome: repo.data.history[0].outcome, focusedMs: repo.data.history[0].focusedMs, label: repo.data.history[0].label },
    { outcome: 'emergency', focusedMs: 11 * 60_000, label: 'Draft' },
  )
})

test('profiles retain schedule references and schedule conflicts are rejected', async (t) => {
  const { engine, repo } = harness(t)
  await engine.dispatch('profiles.save', { name: 'Writing', color: '#4776df', ...input({ workMin: 60 }) })
  await engine.dispatch('profiles.save', { name: 'Reading', color: '#4776df', ...input({ workMin: 60 }) })
  const writing = repo.data.profiles.find((profile) => profile.name === 'Writing')
  const reading = repo.data.profiles.find((profile) => profile.name === 'Reading')
  await engine.dispatch('schedules.save', { profileId: writing.id, enabled: true, days: [1], time: '09:00' })

  await assert.rejects(
    engine.dispatch('schedules.save', { profileId: reading.id, enabled: true, days: [1], time: '09:30' }),
    /overlaps another enabled commitment/,
  )
  await assert.rejects(engine.dispatch('profiles.delete', { id: writing.id }), /Delete this profile’s schedules first/)
  assert.equal(repo.data.profiles.length, 2)
  assert.equal(repo.data.schedules.length, 1)
  assert.equal(repo.data.schedules[0].profileId, writing.id)
})

test('a scheduled occurrence starts deterministically and cannot relock after emergency', async (t) => {
  const now = localTime(2026, 1, 5, 10, 0)
  const { engine, repo, setNow } = harness(t, now)
  const day = new Date(now).getDay()
  repo.transaction((data) => {
    data.profiles.push({ id: 'scheduled', name: 'Scheduled work', color: '#4776df', ...setup(input({ workMin: 25 })) })
    data.schedules.push({ id: 'scheduled-10', profileId: 'scheduled', enabled: true, days: [day], time: '10:00' })
    data.lastSchedulerAt = now - 5_000
  })

  await engine.tick()
  assert.equal(repo.data.session.profileId, 'scheduled')
  await engine.dispatch('emergency')
  assert.equal(repo.data.history.at(-1).outcome, 'emergency')
  setNow(now + 1_000)
  await engine.tick()
  assert.equal(repo.data.session, null)
  assert.equal(repo.data.history.filter((entry) => entry.outcome === 'emergency').length, 1)
})

test('late scheduled occurrences are recorded once as missed instead of starting', async (t) => {
  const scheduledAt = localTime(2026, 1, 6, 10, 0)
  const now = scheduledAt + 16_000
  const { engine, repo, advance } = harness(t, now)
  const day = new Date(now).getDay()
  repo.transaction((data) => {
    data.profiles.push({ id: 'missed', name: 'Missed work', color: '#4776df', ...setup(input()) })
    data.schedules.push({ id: 'missed-10', profileId: 'missed', enabled: true, days: [day], time: '10:00' })
    data.lastSchedulerAt = scheduledAt - 1_000
  })

  await engine.tick()
  assert.equal(repo.data.session, null)
  assert.equal(repo.data.history.filter((entry) => entry.outcome === 'missed').length, 1)
  advance(10_000)
  await engine.tick()
  assert.equal(repo.data.history.filter((entry) => entry.outcome === 'missed').length, 1)
})

test('legacy migration imports preferences into a profile and reports unavailable apps', async (t) => {
  const dir = fs.mkdtempSync('/tmp/studyfocus-core-')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const legacyDir = path.join(dir, 'legacy')
  fs.mkdirSync(legacyDir, { recursive: true })
  const startedAt = localTime(2026, 1, 7, 9)
  const oldHistory = [{
    id: 'legacy-session-1',
    label: 'Essay draft',
    mode: 'focus',
    startedAt,
    focusedMs: 45 * 60_000,
    blocks: 2,
    blocked: ['Test Editor'],
    blockedSites: ['example.com'],
  }]
  const oldPrefs = {
    lastSetup: { mode: 'pomodoro', workMin: 25, breakMin: 5, rounds: 4 },
    lastBlocklist: [APP, { name: 'Removed App', bundlePath: '/Applications/Removed App.app' }],
    lastSites: ['example.com'],
  }
  fs.writeFileSync(path.join(legacyDir, 'history.json'), JSON.stringify(oldHistory))
  fs.writeFileSync(path.join(legacyDir, 'prefs.json'), JSON.stringify(oldPrefs))

  const migrationPlatform = {
    simulation: true,
    strikes: new Map(),
    apps: async () => [APP],
    resolve: async (targets) => {
      const available = targets.filter((target) => target?.bundlePath === APP.bundlePath)
      if (available.length !== targets.length) throw new Error('An application is no longer installed.')
      return available
    },
    enforce: async () => [],
  }
  const repo = new Repository(dir)
  const engine = new Engine(repo, migrationPlatform, { clock: () => startedAt, legacyDir })

  await engine.dispatch('importLegacy')

  assert.deepEqual(repo.data.migration, {
    at: startedAt,
    entries: 1,
    skippedApps: ['Removed App'],
  })
  assert.equal(repo.data.history.length, 1)
  assert.equal(repo.data.history[0].outcome, 'legacy')
  assert.equal(repo.data.history[0].id, 'legacy-session-1')
  assert.equal(repo.data.history[0].verifiedMs, 0)

  assert.equal(repo.data.profiles.length, 1)
  assert.deepEqual(repo.data.profiles[0], {
    id: repo.data.profiles[0].id,
    name: 'Imported setup',
    color: '#4776df',
    mode: 'pomodoro',
    workMin: 25,
    breakMin: 5,
    rounds: 4,
    apps: [APP],
    sites: ['example.com'],
  })
  assert.match(engine.error, /Unavailable or protected apps were omitted: Removed App/)
  for (const filename of ['history.json', 'prefs.json']) {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo.dir, 'legacy-backup', filename), 'utf8')), filename === 'history.json' ? oldHistory : oldPrefs)
  }
})

test('pending website cleanup requires a fresh host timestamp before clearing flags', async (t) => {
  const dir = fs.mkdtempSync('/tmp/studyfocus-core-')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const now = localTime(2026, 1, 8, 9)
  const hostState = { armed: false, at: now - 1_000 }
  const hosts = {
    status: () => hostState,
    clear: () => {},
  }
  const repo = new Repository(dir)
  repo.transaction((data) => {
    data.session = {
      id: 'active-with-sites',
      profileId: null,
      label: 'Web work',
      mode: 'focus',
      workMs: 30 * 60_000,
      breakMs: 5 * 60_000,
      rounds: 1,
      blocklist: [APP],
      siteBlocklist: ['example.com'],
      startedAt: now,
      events: [],
      blockCount: 0,
      verifiedMs: 0,
      systemSites: true,
    }
  })
  const engine = new Engine(repo, { ...platform(), simulation: false }, { clock: () => now, legacyDir: path.join(dir, 'legacy'), hosts })
  // Keep this regression test focused on the persisted flags and timestamp gate.
  engine.waitRelease = async () => false

  await engine.dispatch('emergency')
  assert.equal(repo.data.pendingRelease, true)
  assert.equal(repo.data.pendingHosts, true)
  const releaseAt = repo.data.releaseAt
  assert.equal(releaseAt, now)

  engine.chromeSync({ id: 'test-client-123', revision: `idle:${repo.data.revision}`, name: 'Test' })
  await engine.tick()
  assert.equal(repo.data.pendingRelease, true)
  assert.equal(repo.data.pendingHosts, true)

  // The scheduler transaction changes the idle revision, so the browser must
  // acknowledge that current revision before the next cleanup check.
  engine.chromeSync({ id: 'test-client-123', revision: `idle:${repo.data.revision}`, name: 'Test' })
  hostState.at = releaseAt
  await engine.tick()
  assert.equal(repo.data.pendingRelease, false)
  assert.equal(repo.data.pendingHosts, false)
})

test('a persisted in-progress session recovers through a fresh repository', async (t) => {
  const { dir, engine, now } = harness(t)
  await engine.dispatch('start', input({ label: 'Persist me' }))
  const recovered = new Repository(dir)
  const recoveredEngine = new Engine(recovered, platform(), { clock: now, legacyDir: path.join(dir, 'legacy') })
  assert.equal(recoveredEngine.snapshot().session.label, 'Persist me')
  assert.equal(recoveredEngine.snapshot().session.phase, 'work')
})

test('corrupt primary state recovers a valid backup and preserves the corrupt file', (t) => {
  const dir = fs.mkdtempSync('/tmp/studyfocus-core-')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const repo = new Repository(dir)
  repo.transaction((data) => { data.settings.notifications = false })
  repo.transaction((data) => { data.settings.appearance = 'dark' })
  fs.writeFileSync(path.join(dir, 'state.json'), '{this is corrupt')

  const recovered = new Repository(dir)
  assert.match(recovered.warning, /Recovered the last valid local backup/)
  assert.equal(recovered.data.settings.notifications, false)
  assert.equal(recovered.data.settings.appearance, 'system')
  assert.ok(fs.readdirSync(dir).some((name) => /^state\.json\.corrupt-\d+$/.test(name)))
  assert.equal(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'), '{this is corrupt')
})

test('an unrecoverable corrupt store is left untouched', (t) => {
  const dir = fs.mkdtempSync('/tmp/studyfocus-core-')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'state.json')
  fs.writeFileSync(file, 'not json')
  assert.throws(() => new Repository(dir), /files have been preserved/)
  assert.equal(fs.readFileSync(file, 'utf8'), 'not json')
})

test('offline emergency recovery ends a persisted session at the requested time', async t => {
 const h=harness(t)
 await h.engine.dispatch('start', input())
 h.advance(120000)
 fs.writeFileSync(path.join(h.dir,'emergency-unlock.json'),JSON.stringify({at:h.now()}))
 h.advance(300000)
 const recovered=new Engine(new Repository(h.dir),platform(),{clock:h.now,legacyDir:path.join(h.dir,'legacy')})
 await recovered.tick()
 assert.equal(recovered.data.session,null)
 assert.equal(recovered.data.history[0].outcome,'emergency')
 assert.equal(recovered.data.history[0].focusedMs,120000)
 assert.equal(fs.existsSync(path.join(h.dir,'emergency-unlock.json')),false)
 await recovered.tick()
 assert.equal(recovered.data.history.length,1)
})

test('app-only sessions do not require the optional system website helper', async t => {
 const h=harness(t)
 await h.engine.dispatch('settings.save',{systemSites:true})
 await h.engine.dispatch('start',input())
 assert.equal(h.engine.data.session.systemSites,false)
 h.advance(1000);await h.engine.tick()
 assert.equal(h.engine.data.session.verifiedMs,1000)
})
