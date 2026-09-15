/**
 * Pure session math. No I/O, no side effects — the daemon and the UI both need
 * to agree on what phase a session is in, so the rules live in one place.
 *
 * A pomodoro session is `rounds` work blocks separated by breaks, with no
 * trailing break: total = rounds*work + (rounds-1)*break.
 */

export function totalMs(session) {
  if (session.mode === 'pomodoro') {
    return session.rounds * session.workMs + (session.rounds - 1) * session.breakMs
  }
  return session.workMs
}

export function focusMs(session) {
  return session.mode === 'pomodoro' ? session.rounds * session.workMs : session.workMs
}

/** Where a session stands right now: phase, round, and when each clock runs out. */
export function phaseAt(session, now = Date.now()) {
  const total = totalMs(session)
  const elapsed = Math.max(0, now - session.startedAt)
  const endsAt = session.startedAt + total

  if (elapsed >= total) {
    return { phase: 'done', round: session.rounds ?? 1, enforcing: false, endsAt, phaseEndsAt: endsAt }
  }

  if (session.mode !== 'pomodoro') {
    return { phase: 'work', round: 1, enforcing: true, endsAt, phaseEndsAt: endsAt }
  }

  const cycle = session.workMs + session.breakMs
  const round = Math.floor(elapsed / cycle)
  const within = elapsed % cycle
  const working = within < session.workMs

  return {
    phase: working ? 'work' : 'break',
    round: round + 1,
    enforcing: working,
    endsAt,
    phaseEndsAt: session.startedAt + round * cycle + (working ? session.workMs : cycle),
  }
}

/** Aggregate stats over completed sessions, for the stats view. */
export function summarise(history) {
  const dayKey = (ts) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const byDay = new Map()
  let longestMs = 0
  let totalBlocks = 0

  for (const entry of history) {
    const key = dayKey(entry.startedAt)
    byDay.set(key, (byDay.get(key) ?? 0) + entry.focusedMs)
    longestMs = Math.max(longestMs, entry.focusedMs)
    totalBlocks += entry.blocks ?? 0
  }

  // Streak: consecutive days with at least one completed session, counting back
  // from today. A session today is not required — yesterday keeps it alive until
  // the day is over.
  let streak = 0
  const cursor = new Date()
  if (!byDay.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  while (byDay.has(dayKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  const today = byDay.get(dayKey(Date.now())) ?? 0

  const weekStart = new Date()
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - 6)
  const week = history
    .filter((entry) => entry.startedAt >= weekStart.getTime())
    .reduce((sum, entry) => sum + entry.focusedMs, 0)

  const bestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? null

  return {
    sessions: history.length,
    todayMs: today,
    weekMs: week,
    longestMs,
    totalBlocks,
    streak,
    bestDay: bestDay ? { day: bestDay[0], ms: bestDay[1] } : null,
    byDay: [...byDay.entries()].map(([day, ms]) => ({ day, ms })).sort((a, b) => a.day.localeCompare(b.day)),
  }
}
