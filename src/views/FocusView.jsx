import { useEffect, useMemo, useState } from 'react'
import {
  AppWindow,
  Check,
  ChevronDown,
  Chrome,
  CircleAlert,
  Clock3,
  Globe2,
  LockKeyhole,
  Play,
  Plus,
  ShieldCheck,
  TriangleAlert,
  X,
} from 'lucide-react'
import { api } from '../api.js'
import ModalDialog from '../components/ModalDialog.jsx'
import { normalizeDomain } from '../../shared/domains.js'
import './focus.css'

const LIMITS = {
  focus: { work: [1, 480], break: [1, 60], rounds: [1, 12] },
  pomodoro: { work: [1, 180], break: [1, 60], rounds: [1, 12] },
}

const numberInRange = (value, [min, max]) =>
  Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max

function formatClock(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`
}

function shortDuration(milliseconds) {
  const minutes = Math.max(0, Math.round(milliseconds / 60000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
}

function keyFor(app) {
  return app.bundleId || app.bundlePath || app.id
}

function ProfileSelect({ profiles, value, onChange }) {
  return (
    <label className="field focus-profile-field">
      <span>Profile</span>
      <span className="focus-select-wrap">
        <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="custom">Custom session</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
        <ChevronDown aria-hidden="true" size={16} />
      </span>
    </label>
  )
}

function AppIcon({ app }) {
  if (app.icon) return <img className="focus-app-icon" src={app.icon} alt="" />
  return <span className="focus-app-icon focus-app-icon-fallback" aria-hidden="true"><AppWindow size={15} /></span>
}

function Readiness({ health, needsChrome }) {
  const engineReady = Boolean(health?.engine && health?.apps)
  const chromeReady = Boolean(health?.chromeReady)
  return (
    <div className="focus-readiness" aria-label="Session readiness">
      <div className={`focus-readiness-item ${engineReady ? 'is-ready' : 'needs-action'}`}>
        <ShieldCheck size={16} aria-hidden="true" />
        <span><strong>Focus service</strong><small>{engineReady ? 'Ready to enforce app blocks' : 'Needs to be running'}</small></span>
        {engineReady && <Check size={15} aria-label="Ready" />}
      </div>
      <div className={`focus-readiness-item ${chromeReady ? 'is-ready' : needsChrome ? 'needs-action' : ''}`}>
        <Chrome size={16} aria-hidden="true" />
        <span><strong>Chrome blocking</strong><small>{chromeReady ? 'Ready for selected websites' : needsChrome ? 'Required for selected websites' : 'Optional until sites are selected'}</small></span>
        {chromeReady && <Check size={15} aria-label="Ready" />}
      </div>
      {health?.simulation && <p className="focus-simulation"><CircleAlert size={15} aria-hidden="true" /> Simulation mode is on. No apps or sites will be blocked.</p>}
      {health?.error && <p className="focus-inline-error"><CircleAlert size={15} aria-hidden="true" /> {health.error}</p>}
    </div>
  )
}

function SetupForm({ state, onError }) {
  const [availableApps, setAvailableApps] = useState([])
  const [appsLoading, setAppsLoading] = useState(true)
  const [profileId, setProfileId] = useState('custom')
  const [label, setLabel] = useState('')
  const [mode, setMode] = useState('focus')
  const [workMin, setWorkMin] = useState(45)
  const [breakMin, setBreakMin] = useState(5)
  const [rounds, setRounds] = useState(4)
  const [selectedApps, setSelectedApps] = useState([])
  const [sites, setSites] = useState([])
  const [appQuery, setAppQuery] = useState('')
  const [siteDraft, setSiteDraft] = useState('')
  const [siteError, setSiteError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let active = true
    api.apps()
      .then((result) => {
        if (!active) return
        setAvailableApps(Array.isArray(result) ? result : result?.apps ?? [])
      })
      .catch((error) => onError(error.message))
      .finally(() => active && setAppsLoading(false))
    return () => { active = false }
  }, [onError])

  const profiles = state?.profiles ?? []
  const health = state?.health
  const limits = LIMITS[mode]
  const durationValid = numberInRange(workMin, limits.work) &&
    (mode === 'focus' || (numberInRange(breakMin, limits.break) && numberInRange(rounds, limits.rounds)))
  const serviceReady = Boolean(health?.engine && health?.apps)
  const chromeReady = !sites.length || Boolean(health?.chromeReady)
  const canStart = durationValid && selectedApps.length + sites.length > 0 && serviceReady && chromeReady && !starting
  const totalMinutes = mode === 'focus' ? Number(workMin) : Number(workMin) * Number(rounds) + Number(breakMin) * Math.max(0, Number(rounds) - 1)
  const visibleApps = useMemo(() => {
    const query = appQuery.trim().toLowerCase()
    return availableApps.filter((app) => !query || app.name.toLowerCase().includes(query))
  }, [availableApps, appQuery])

  function clearConfirmation() { setConfirming(false) }

  function updateProfile(nextId) {
    setProfileId(nextId)
    clearConfirmation()
    const profile = profiles.find((item) => item.id === nextId)
    if (!profile) return
    setMode(profile.mode)
    setWorkMin(profile.workMin)
    setBreakMin(profile.breakMin)
    setRounds(profile.rounds)
    setSelectedApps(profile.apps ?? [])
    setSites(profile.sites ?? [])
  }

  function toggleApp(app) {
    if (app.protected) return
    setSelectedApps((current) => current.some((item) => keyFor(item) === keyFor(app))
      ? current.filter((item) => keyFor(item) !== keyFor(app))
      : [...current, app])
    clearConfirmation()
  }

  async function chooseApp() {
    try {
      const result = await api.chooseApp()
      const app = result?.app ?? result
      if (!app?.name || !keyFor(app)) return
      setAvailableApps((current) => current.some((item) => keyFor(item) === keyFor(app)) ? current : [...current, app])
      setSelectedApps((current) => current.some((item) => keyFor(item) === keyFor(app)) ? current : [...current, app])
      clearConfirmation()
    } catch (error) {
      onError(error.message)
    }
  }

  function addSite() {
    const domain = normalizeDomain(siteDraft)
    if (!domain) {
      setSiteError('Enter a public domain, such as youtube.com.')
      return
    }
    setSites((current) => current.includes(domain) ? current : [...current, domain])
    setSiteDraft('')
    setSiteError('')
    clearConfirmation()
  }

  async function start() {
    if (!canStart) return
    setStarting(true)
    try {
      await api.start({
        ...(profileId !== 'custom' ? { profileId } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
        mode,
        workMin: Number(workMin),
        breakMin: Number(breakMin),
        rounds: Number(rounds),
        apps: selectedApps,
        sites,
      })
      setConfirming(false)
    } catch (error) {
      setConfirming(false)
      onError(error.message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="focus-setup" aria-labelledby="focus-title">
      <div className="focus-intro">
        <p className="eyebrow">Focus session</p>
        <h1 id="focus-title">Make room for what matters.</h1>
        <p>Choose the distractions to set aside, then commit to one clear stretch of work.</p>
      </div>

      <div className="focus-form-grid">
        <section className="panel focus-session-panel" aria-labelledby="session-details-title">
          <div className="focus-panel-heading"><div><p className="eyebrow">Plan</p><h2 id="session-details-title">Your session</h2></div></div>
          <div className="focus-field-grid">
            <ProfileSelect profiles={profiles} value={profileId} onChange={updateProfile} />
            <label className="field focus-goal-field"><span>What will you work on?</span><input className="input" value={label} maxLength={80} onChange={(event) => { setLabel(event.target.value); clearConfirmation() }} placeholder="Write a first draft" /></label>
          </div>
          <fieldset className="focus-fieldset"><legend>Session style</legend><div className="focus-segmented" role="group" aria-label="Session style">
            <button type="button" aria-pressed={mode === 'focus'} onClick={() => { setMode('focus'); clearConfirmation() }}>Focus</button>
            <button type="button" aria-pressed={mode === 'pomodoro'} onClick={() => { setMode('pomodoro'); clearConfirmation() }}>Pomodoro</button>
          </div></fieldset>
          <div className="focus-duration-fields">
            <label className="field"><span>{mode === 'focus' ? 'Minutes' : 'Work minutes'}</span><input className="input" type="number" min={limits.work[0]} max={limits.work[1]} value={workMin} onChange={(event) => { setWorkMin(event.target.value); clearConfirmation() }} /></label>
            {mode === 'pomodoro' && <><label className="field"><span>Break minutes</span><input className="input" type="number" min="1" max="60" value={breakMin} onChange={(event) => { setBreakMin(event.target.value); clearConfirmation() }} /></label><label className="field"><span>Rounds</span><input className="input" type="number" min="1" max="12" value={rounds} onChange={(event) => { setRounds(event.target.value); clearConfirmation() }} /></label></>}
          </div>
          {!durationValid && <p className="focus-inline-error"><CircleAlert size={15} aria-hidden="true" /> Enter a whole number in the allowed range.</p>}
          {durationValid && <p className="focus-total"><Clock3 size={16} aria-hidden="true" /> {shortDuration(totalMinutes * 60000)} total{mode === 'pomodoro' ? ` · ${rounds} work rounds` : ''}</p>}
        </section>

        <section className="panel focus-block-panel" aria-labelledby="block-title">
          <div className="focus-panel-heading"><div><p className="eyebrow">Boundaries</p><h2 id="block-title">Block distractions</h2></div><span className="focus-count">{selectedApps.length + sites.length} selected</span></div>
          <label className="field"><span>Find an app</span><span className="focus-search"><AppWindow size={16} aria-hidden="true" /><input className="input" value={appQuery} onChange={(event) => setAppQuery(event.target.value)} placeholder="Search installed apps" /></span></label>
          <div className="focus-app-picker" aria-live="polite">
            {appsLoading && <p className="muted">Looking for installed apps…</p>}
            {!appsLoading && visibleApps.map((app) => {
              const selected = selectedApps.some((item) => keyFor(item) === keyFor(app))
              return <button type="button" key={keyFor(app)} className="focus-app-row" aria-pressed={selected} disabled={app.protected} onClick={() => toggleApp(app)} title={app.protected ? 'This app is protected and cannot be blocked.' : app.bundlePath}>
                <AppIcon app={app} /><span>{app.name}</span>{app.protected ? <small>Protected</small> : selected && <Check size={16} aria-label="Selected" />}
              </button>
            })}
            {!appsLoading && !visibleApps.length && <p className="muted">No installed apps match that search.</p>}
          </div>
          <button type="button" className="focus-link-button" onClick={chooseApp}><Plus size={16} aria-hidden="true" /> Choose another app…</button>
          {selectedApps.length > 0 && <div className="focus-chips" aria-label="Selected apps">{selectedApps.map((app) => <button type="button" key={keyFor(app)} className="focus-chip" onClick={() => toggleApp(app)}><AppIcon app={app} /><span>{app.name}</span><X size={14} aria-label={`Remove ${app.name}`} /></button>)}</div>}
          <div className="focus-site-section">
            <label className="field"><span>Block a website</span><span className="focus-site-entry"><Globe2 size={16} aria-hidden="true" /><input className="input" value={siteDraft} onChange={(event) => { setSiteDraft(event.target.value); setSiteError('') }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSite() } }} placeholder="youtube.com" /><button type="button" className="button" onClick={addSite}>Add</button></span></label>
            {siteError && <p className="focus-inline-error"><CircleAlert size={15} aria-hidden="true" /> {siteError}</p>}
            {sites.length > 0 && <><div className="focus-chips" aria-label="Selected websites">{sites.map((site) => <button type="button" key={site} className="focus-chip" onClick={() => { setSites((current) => current.filter((item) => item !== site)); clearConfirmation() }}><Globe2 size={14} aria-hidden="true" /><span>{site}</span><X size={14} aria-label={`Remove ${site}`} /></button>)}</div><p className="focus-coverage">Includes subdomains such as www.{sites[0]}.</p></>}
          </div>
        </section>
      </div>

      <Readiness health={health} needsChrome={sites.length > 0} />
      {!selectedApps.length && !sites.length && <p className="focus-validation">Choose at least one app or website to begin.</p>}
      <div className="focus-start-row"><p>When the timer begins, selected apps may be closed without saving their current work.</p><button type="button" className="button primary focus-start-button" disabled={!canStart} onClick={() => setConfirming(true)}><Play size={17} aria-hidden="true" /> Start focus session</button></div>

      {confirming && <div className="modal-backdrop" role="presentation"><ModalDialog className="modal focus-confirm" onClose={() => !starting && setConfirming(false)} aria-labelledby="start-confirm-title"><TriangleAlert size={22} aria-hidden="true" /><h2 id="start-confirm-title">Ready to begin?</h2><p>StudyFocus will start your timer and may close selected apps with unsaved work. Your boundaries stay in place until the session ends.</p><div className="focus-modal-actions"><button type="button" className="button" disabled={starting} onClick={() => setConfirming(false)}>Go back</button><button type="button" className="button primary" disabled={starting} onClick={start}>{starting ? 'Starting…' : 'Start session'}</button></div></ModalDialog></div>}
    </section>
  )
}

function ActiveSession({ state, onError }) {
  const session = state.session
  const [now, setNow] = useState(Date.now())
  const [confirmingEmergency, setConfirmingEmergency] = useState(false)
  const [releasing, setReleasing] = useState(false)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [])

  const phaseRemaining = Math.max(0, session.phaseEndsAt - now)
  const sessionRemaining = Math.max(0, session.endsAt - now)
  const totalProgress = session.totalMs ? Math.min(100, Math.max(0, (1 - sessionRemaining / session.totalMs) * 100)) : 0
  const phaseName = session.phase === 'work' ? 'Focused time' : session.phase === 'break' ? 'Break' : 'Complete'
  const events = [...(session.events ?? [])].reverse()
  const simulation = Boolean(state.health?.simulation)

  async function emergency() {
    setReleasing(true)
    try {
      await api.emergency()
      setConfirmingEmergency(false)
    } catch (error) {
      onError(error.message)
    } finally {
      setReleasing(false)
    }
  }

  return <section className="focus-active" aria-labelledby="active-title">
    <div className="focus-active-hero">
      <p className="eyebrow"><LockKeyhole size={14} aria-hidden="true" /> {phaseName}</p>
      <h1 id="active-title">{session.label || 'Focus session'}</h1>
      <div className="focus-countdown" aria-label={`${formatClock(phaseRemaining)} remaining`}>{formatClock(phaseRemaining)}</div>
      <p className="focus-active-meta">{session.mode === 'pomodoro' ? `Round ${session.round} of ${session.rounds}` : 'One uninterrupted block'} · {shortDuration(sessionRemaining)} remaining</p>
      <div className="focus-progress" aria-label={`${Math.round(totalProgress)} percent complete`}><span style={{ width: `${totalProgress}%` }} /></div>
      <p className="focus-progress-label">{Math.round(totalProgress)}% complete</p>
    </div>

    <div className="focus-active-grid">
      <section className="panel" aria-labelledby="active-blocked-title"><div className="focus-panel-heading"><div><p className="eyebrow">Protected time</p><h2 id="active-blocked-title">Blocked now</h2></div><span className="focus-count">{(session.blocklist?.length ?? 0) + (session.siteBlocklist?.length ?? 0)}</span></div>
        <div className="focus-blocked-groups">{session.blocklist?.length > 0 && <div><h3>Apps</h3><div className="focus-chip-list">{session.blocklist.map((app) => <span className="focus-status-chip" key={keyFor(app)}><AppIcon app={app} />{app.name}</span>)}</div></div>}{session.siteBlocklist?.length > 0 && <div><h3>Websites</h3><div className="focus-chip-list">{session.siteBlocklist.map((site) => <span className="focus-status-chip" key={site}><Globe2 size={14} aria-hidden="true" />{site}</span>)}</div></div>}</div>
      </section>
      <section className="panel" aria-labelledby="active-status-title"><p className="eyebrow">Status</p><h2 id="active-status-title">{simulation ? 'Test mode: no real enforcement' : `Enforcement is ${session.enforcing ? 'active' : 'paused for break'}`}</h2><div className={`focus-status ${session.enforcing && !simulation ? 'is-active' : ''}`}><span aria-hidden="true" />{simulation ? 'Simulation is on. No apps or websites are being blocked.' : session.enforcing ? 'Distractions are being blocked.' : 'Your break is open until the next round.'}</div><p className="focus-status-note">{session.blockCount ?? 0} interruption{(session.blockCount ?? 0) === 1 ? '' : 's'} intercepted</p></section>
    </div>
    <details className="panel focus-events"><summary><span><p className="eyebrow">Activity</p><h2>Blocked attempts</h2></span><span className="focus-events-summary">{events.length} events <ChevronDown size={16} aria-hidden="true" /></span></summary>{events.length ? <ol>{events.map((event, index) => <li key={`${event.t}-${index}`}><time>{new Date(event.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><span><strong>{event.app}</strong> {event.action === 'force-quit' ? 'was closed' : 'was blocked'}{event.count > 1 ? ` ×${event.count}` : ''}</span></li>)}</ol> : <p className="muted">No blocked attempts yet. Stay with the work.</p>}</details>
    <button type="button" className="button focus-emergency" onClick={() => setConfirmingEmergency(true)}><LockKeyhole size={16} aria-hidden="true" /> Emergency unlock</button>
    {confirmingEmergency && <div className="modal-backdrop" role="presentation"><ModalDialog className="modal focus-confirm focus-emergency-confirm" onClose={() => !releasing && setConfirmingEmergency(false)} aria-labelledby="emergency-confirm-title"><TriangleAlert size={22} aria-hidden="true" /><h2 id="emergency-confirm-title">Unlock everything now?</h2><p>This ends the session immediately and releases all app and website blocks. There is no delay.</p><div className="focus-modal-actions"><button type="button" className="button" disabled={releasing} onClick={() => setConfirmingEmergency(false)}>Keep session</button><button type="button" className="button danger" disabled={releasing} onClick={emergency}>{releasing ? 'Unlocking…' : 'Unlock now'}</button></div></ModalDialog></div>}
  </section>
}

export default function FocusView({ state, onError = () => {} }) {
  if (!state?.session) return <div className="focus-view"><SetupForm state={state} onError={onError} /></div>
  return <div className="focus-view"><ActiveSession state={state} onError={onError} /></div>
}
