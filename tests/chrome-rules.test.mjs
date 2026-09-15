import test from 'node:test'
import assert from 'node:assert/strict'
import { matches, phase, rulesFor } from '../chrome/rules.js'

function policy(session) {
  return { session }
}

function session(overrides = {}) {
  return {
    startedAt: 1_000,
    endsAt: 7_000,
    mode: 'focus',
    workMs: 6_000,
    breakMs: 1_000,
    rounds: 1,
    sites: ['example.com'],
    ...overrides,
  }
}

test('matches exact domains and true subdomains while rejecting deceptive siblings and query strings', () => {
  const sites = ['example.com']

  assert.equal(matches('https://example.com', sites), true)
  assert.equal(matches('http://example.com/path/to/page?tab=1', sites), true)
  assert.equal(matches('https://www.example.com/assets/app.js', sites), true)
  assert.equal(matches('https://deep.www.example.com/frame', sites), true)

  assert.equal(matches('https://example.com.evil.test/', sites), false)
  assert.equal(matches('https://notexample.com/', sites), false)
  assert.equal(matches('https://evil.test/?next=https%3A%2F%2Fexample.com', sites), false)
  assert.equal(matches('https://evil.test/example.com?target=example.com', sites), false)
  assert.equal(matches('https://example.com@evil.test/', sites), false)
})

test('matches only web schemes', () => {
  const sites = ['example.com']

  assert.equal(matches('ftp://example.com/file.txt', sites), false)
  assert.equal(matches('file:///Users/me/example.com.html', sites), false)
  assert.equal(matches('chrome://example.com/', sites), false)
  assert.equal(matches('javascript:location="https://example.com"', sites), false)
  assert.equal(matches('not a URL', sites), false)
})

test('focus phase is idle before start, active at start, and idle at the end', () => {
  const focus = policy(session())

  assert.deepEqual(phase(focus, 999), { work: false, next: 1_000 })
  assert.deepEqual(phase(focus, 1_000), { work: true, next: 7_000 })
  assert.deepEqual(phase(focus, 6_999), { work: true, next: 7_000 })
  assert.deepEqual(phase(focus, 7_000), { work: false, next: null })
  assert.deepEqual(phase(focus, 8_000), { work: false, next: null })
})

test('Pomodoro phase follows work and break boundaries without a trailing break', () => {
  // Three work rounds and only two breaks: 3*100 + 2*50 = 400ms.
  const pomodoro = policy(
    session({
      startedAt: 0,
      endsAt: 400,
      mode: 'pomodoro',
      workMs: 100,
      breakMs: 50,
      rounds: 3,
    }),
  )

  assert.deepEqual(phase(pomodoro, -1), { work: false, next: 0 })
  assert.deepEqual(phase(pomodoro, 0), { work: true, next: 100 })
  assert.deepEqual(phase(pomodoro, 99), { work: true, next: 100 })
  assert.deepEqual(phase(pomodoro, 100), { work: false, next: 150 })
  assert.deepEqual(phase(pomodoro, 149), { work: false, next: 150 })
  assert.deepEqual(phase(pomodoro, 150), { work: true, next: 250 })
  assert.deepEqual(phase(pomodoro, 250), { work: false, next: 300 })
  assert.deepEqual(phase(pomodoro, 300), { work: true, next: 400 })
  assert.deepEqual(phase(pomodoro, 399), { work: true, next: 400 })
  assert.deepEqual(phase(pomodoro, 400), { work: false, next: null })
})

test('rulesFor returns no rules for missing, stale, pre-start, break, or expired policies', () => {
  assert.deepEqual(rulesFor(null, 5_000), [])
  assert.deepEqual(rulesFor({}, 5_000), [])
  assert.deepEqual(rulesFor(policy(session({ startedAt: 2_000 })), 1_999), [])
  assert.deepEqual(
    rulesFor(
      policy(
        session({
          startedAt: 0,
          endsAt: 400,
          mode: 'pomodoro',
          workMs: 100,
          breakMs: 50,
          rounds: 3,
        }),
      ),
      125,
    ),
    [],
  )
  assert.deepEqual(rulesFor(policy(session({ endsAt: 1_000 })), 1_000), [])
  assert.deepEqual(rulesFor(policy(session({ endsAt: 1_000 })), 2_000), [])
})

test('rulesFor dynamically builds DNR rules for each site and supported resource type', () => {
  const resources = [
    'main_frame',
    'sub_frame',
    'stylesheet',
    'script',
    'image',
    'font',
    'object',
    'xmlhttprequest',
    'ping',
    'csp_report',
    'media',
    'websocket',
    'other',
  ]
  const rules = rulesFor(
    policy(
      session({
        sites: ['example.com', 'study.test', 'subdomain.example.org'],
      }),
    ),
    2_000,
  )

  assert.equal(rules.length, 3)
  assert.deepEqual(rules.map((rule) => rule.id), [1, 2, 3])
  assert.deepEqual(rules.map((rule) => rule.condition.requestDomains), [
    ['example.com'],
    ['study.test'],
    ['subdomain.example.org'],
  ])
  for (const rule of rules) {
    assert.equal(rule.priority, 1)
    assert.deepEqual(rule.action, { type: 'block' })
    assert.deepEqual(rule.condition.resourceTypes, resources)
  }
})
