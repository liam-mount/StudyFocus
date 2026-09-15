import { useMemo, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  Loader2,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react'
import { api } from '../api.js'
import { dateLabel, dayLabel, duration, timeOfDay } from '../lib/format.js'
import './history-settings.css'

const OUTCOMES = [
  ['all', 'All outcomes'],
  ['completed', 'Completed'],
  ['emergency', 'Emergency'],
  ['missed', 'Missed'],
  ['failed', 'Failed'],
  ['legacy', 'Imported'],
]

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function buildSeries(byDay, now) {
  const lookup = new Map((Array.isArray(byDay) ? byDay : []).map((entry) => [entry.day, entry.ms]))
  const anchor = new Date(now || Date.now())
  anchor.setHours(0, 0, 0, 0)
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(anchor)
    date.setDate(anchor.getDate() - (13 - index))
    const key = dayKey(date)
    return { key, ms: Number(lookup.get(key)) || 0, today: index === 13 }
  })
}

function outcomeLabel(outcome) {
  return {
    completed: 'Completed',
    emergency: 'Emergency stop',
    missed: 'Missed',
    failed: 'Failed',
    legacy: 'Imported',
  }[outcome] ?? 'Unknown'
}

function outcomeClass(outcome) {
  return outcome === 'completed' ? 'success' : outcome === 'emergency' ? 'danger' : 'muted'
}

function formatTime(ms) {
  return `${dateLabel(ms)} · ${timeOfDay(ms)}`
}

export default function HistoryView({ state, onError }) {
  const [asTable, setAsTable] = useState(false)
  const [profileFilter, setProfileFilter] = useState('all')
  const [outcomeFilter, setOutcomeFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState(null)

  const profiles = state?.profiles ?? []
  const history = state?.history ?? []
  const stats = state?.stats ?? {}
  const series = useMemo(() => buildSeries(stats.byDay, state?.now), [stats.byDay, state?.now])
  const peak = Math.max(...series.map((entry) => entry.ms), 1)
  const profileNames = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile.name])),
    [profiles],
  )
  const filteredHistory = history.filter((entry) => {
    const matchesProfile = profileFilter === 'all' || entry.profileId === profileFilter
    const matchesOutcome = outcomeFilter === 'all' || entry.outcome === outcomeFilter
    return matchesProfile && matchesOutcome
  })

  async function handleExport() {
    setExporting(true)
    setToast(null)
    try {
      const result = await api.exportData()
      if (result?.message) setToast({ type: 'success', message: result.message })
      else if (result?.path) setToast({ type: 'success', message: `Exported data to ${result.path}` })
      else setToast({ type: 'success', message: 'Your StudyFocus data is ready.' })
    } catch (error) {
      const message = error?.message || 'Could not export your data.'
      setToast({ type: 'error', message })
      onError?.(message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <main className="sf-history" aria-labelledby="history-title">
      <div className="sf-view-heading">
        <div>
          <p className="eyebrow">History</p>
          <h1 id="history-title">Time well spent.</h1>
          <p className="muted">A clear record of the time you committed and the blocks StudyFocus enforced.</p>
        </div>
        <button className="button" type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 aria-hidden="true" className="sf-spin" size={16} /> : <Download aria-hidden="true" size={16} />}
          {exporting ? 'Exporting…' : 'Export data'}
        </button>
      </div>

      {toast && (
        <div className={`sf-toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          {toast.type === 'success' ? <CheckCircle2 aria-hidden="true" size={16} /> : null}
          <span>{toast.message}</span>
          <button type="button" className="sf-toast-dismiss" aria-label="Dismiss message" onClick={() => setToast(null)}>
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}

      <section className="sf-stat-grid" aria-label="Focus summary">
        <div className="sf-stat-card"><span>Today</span><strong>{duration(stats.todayMs || 0)}</strong></div>
        <div className="sf-stat-card"><span>7 days</span><strong>{duration(stats.weekMs || 0)}</strong></div>
        <div className="sf-stat-card"><span>Streak</span><strong>{stats.streak || 0}<small>{stats.streak === 1 ? ' day' : ' days'}</small></strong></div>
        <div className="sf-stat-card"><span>Completed</span><strong>{stats.sessions || 0}</strong></div>
      </section>

      <section className="panel sf-panel" aria-labelledby="history-chart-title">
        <div className="sf-panel-heading">
          <div>
            <p className="eyebrow">Your rhythm</p>
            <h2 id="history-chart-title">Focused time · last 14 days</h2>
          </div>
          <button className="button" type="button" aria-pressed={asTable} onClick={() => setAsTable((value) => !value)}>
            {asTable ? <BarChart3 aria-hidden="true" size={16} /> : <Table2 aria-hidden="true" size={16} />}
            {asTable ? 'Chart' : 'Table'}
          </button>
        </div>

        {asTable ? (
          <div className="sf-chart-table-wrap">
            <table className="sf-chart-table">
              <caption className="sf-visually-hidden">Focused time for each of the last 14 days</caption>
              <thead><tr><th scope="col">Day</th><th scope="col">Focused time</th></tr></thead>
              <tbody>{series.map((entry) => <tr key={entry.key}><th scope="row">{entry.key}</th><td>{entry.ms ? duration(entry.ms) : '—'}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="sf-chart" role="img" aria-label="Bar chart of focused time for the last 14 days">
            <div className="sf-bars">
              {series.map((entry) => {
                const height = entry.ms ? Math.max(5, (entry.ms / peak) * 100) : 2
                return (
                  <div className="sf-bar-column" key={entry.key}>
                    <span className="sf-bar-value">{entry.ms ? duration(entry.ms) : ''}</span>
                    <span className={`sf-bar${entry.ms ? '' : ' zero'}`} style={{ height: `${height}%` }} title={`${entry.key}: ${entry.ms ? duration(entry.ms) : 'nothing'}`} />
                    <span className={entry.today ? 'today' : ''}>{dayLabel(entry.key)}</span>
                  </div>
                )
              })}
            </div>
            <p className="sf-chart-note"><ShieldCheck aria-hidden="true" size={14} /> Bars show committed focus time from your session history.</p>
          </div>
        )}
      </section>

      <section className="panel sf-panel" aria-labelledby="session-history-title">
        <div className="sf-panel-heading sf-history-heading">
          <div>
            <p className="eyebrow">Session log</p>
            <h2 id="session-history-title">Recent sessions</h2>
          </div>
          <div className="sf-filter-row" aria-label="Filter history">
            <Filter aria-hidden="true" size={15} />
            <label className="sf-visually-hidden" htmlFor="history-profile-filter">Profile</label>
            <select id="history-profile-filter" className="input sf-select" value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)}>
              <option value="all">All profiles</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
            <label className="sf-visually-hidden" htmlFor="history-outcome-filter">Outcome</label>
            <select id="history-outcome-filter" className="input sf-select" value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)}>
              {OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        {filteredHistory.length ? (
          <div className="sf-session-list">
            {filteredHistory.map((entry) => {
              const isExpanded = expanded === entry.id
              const hasVerifiedMs = Number.isFinite(Number(entry.verifiedMs))
              const verifiedMs = hasVerifiedMs ? Number(entry.verifiedMs) : null
              return (
                <article className="sf-session" key={entry.id}>
                  <button className="sf-session-summary" type="button" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : entry.id)}>
                    <span className={`sf-outcome-dot ${outcomeClass(entry.outcome)}`} aria-hidden="true" />
                    <span className="sf-session-main">
                      <strong>{entry.label || 'Focus session'}</strong>
                      <span>{formatTime(entry.startedAt)}{profileNames.get(entry.profileId) ? ` · ${profileNames.get(entry.profileId)}` : ''}</span>
                    </span>
                    <span className="sf-session-metrics"><b>{duration(entry.focusedMs || 0)}</b><em className={`sf-outcome ${outcomeClass(entry.outcome)}`}>{outcomeLabel(entry.outcome)}</em></span>
                    {isExpanded ? <ChevronUp aria-hidden="true" size={18} /> : <ChevronDown aria-hidden="true" size={18} />}
                  </button>
                  {isExpanded && (
                    <div className="sf-session-details">
                      <div><span>Committed / focused time</span><strong>{duration(entry.focusedMs || 0)}</strong></div>
                      <div><span>Verified enforcement</span><strong>{verifiedMs == null ? '—' : duration(verifiedMs)}</strong></div>
                      <div><span>Blocks enforced</span><strong>{entry.blocks || 0}</strong></div>
                      <div><span>Blocked targets</span><strong>{(entry.blocked?.length || 0) + (entry.blockedSites?.length || 0)}</strong></div>
                      {entry.detail && <p className="sf-detail-copy">{entry.detail}</p>}
                      <p className="sf-verification-note"><ShieldCheck aria-hidden="true" size={14} /> Verified enforcement describes active blocking coverage; it does not measure attention.</p>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="sf-empty"><CheckCircle2 aria-hidden="true" size={22} /><p>No sessions match these filters yet.</p></div>
        )}
      </section>
    </main>
  )
}
