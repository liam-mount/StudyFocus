import { useEffect, useMemo, useState } from 'react'
import {
  AppWindow,
  Check,
  Copy,
  Globe2,
  Info,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '../api.js'
import ModalDialog from '../components/ModalDialog.jsx'
import { normalizeDomain } from '../../shared/domains.js'

const COLORS = [
  { value: '#4f7cff', label: 'Blue' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#e09a3e', label: 'Amber' },
  { value: '#e56b6f', label: 'Coral' },
  { value: '#36a269', label: 'Green' },
  { value: '#8290a8', label: 'Slate' },
]

const DEFAULT_PROFILE = {
  name: '',
  color: COLORS[0].value,
  mode: 'focus',
  workMin: 45,
  breakMin: 5,
  rounds: 4,
  apps: [],
  sites: [],
}

function appKey(app) {
  return app?.bundlePath || app?.bundleId || app?.id || app?.name
}

function appName(app) {
  return app?.name || app?.bundleId || app?.bundlePath || 'Unnamed app'
}

function initials(name) {
  const words = String(name).replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

function normalizeApps(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.apps)) return result.apps
  return []
}

function selectedApp(result) {
  if (Array.isArray(result)) return result[0]
  return result?.app || result?.selected || result
}

function conflictMessages(result) {
  const candidates = [result?.conflicts, result?.error?.conflicts, result?.data?.conflicts]
  const conflicts = candidates.find((value) => Array.isArray(value))
  if (!conflicts) return []
  return conflicts.map((conflict) => {
    if (typeof conflict === 'string') return conflict
    return conflict?.message || conflict?.detail || conflict?.reason || JSON.stringify(conflict)
  })
}

function copyProfile(profile) {
  const { id: _id, ...withoutId } = profile
  return {
    ...DEFAULT_PROFILE,
    ...withoutId,
    apps: [...(profile.apps || [])],
    sites: [...(profile.sites || [])],
  }
}

export default function ProfilesView({ state, onError = () => {} }) {
  const profiles = state?.profiles || []
  const schedules = state?.schedules || []
  const [apps, setApps] = useState([])
  const [appsLoading, setAppsLoading] = useState(false)
  const [appQuery, setAppQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(DEFAULT_PROFILE)
  const [siteDraft, setSiteDraft] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    let mounted = true
    setAppsLoading(true)
    api
      .apps()
      .then((result) => {
        if (mounted) setApps(normalizeApps(result))
      })
      .catch(() => {
        if (mounted) setApps([])
      })
      .finally(() => mounted && setAppsLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  const visibleApps = useMemo(() => {
    const query = appQuery.trim().toLowerCase()
    return apps.filter((app) => {
      if (!query) return true
      return [app.name, app.bundleId, app.bundlePath].filter(Boolean).join(' ').toLowerCase().includes(query)
    })
  }, [apps, appQuery])

  function openNew() {
    setEditing('new')
    setDraft({ ...DEFAULT_PROFILE, apps: [], sites: [] })
    setSiteDraft('')
    setAppQuery('')
    setFormError('')
  }

  function openEdit(profile) {
    setEditing(profile.id)
    setDraft({
      ...DEFAULT_PROFILE,
      ...profile,
      apps: [...(profile.apps || [])],
      sites: [...(profile.sites || [])],
    })
    setSiteDraft('')
    setAppQuery('')
    setFormError('')
  }

  function closeForm() {
    if (saving) return
    setEditing(null)
    setFormError('')
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function toggleApp(app) {
    if (app?.protected) return
    const key = appKey(app)
    setDraft((current) => {
      const exists = current.apps.some((selected) => appKey(selected) === key)
      return {
        ...current,
        apps: exists
          ? current.apps.filter((selected) => appKey(selected) !== key)
          : [...current.apps, app],
      }
    })
  }

  async function chooseApp() {
    setFormError('')
    try {
      const picked = selectedApp(await api.chooseApp())
      if (picked && !picked.protected) toggleApp(picked)
    } catch (error) {
      const message = error?.message || 'Could not choose an application.'
      setFormError(message)
      onError(message)
    }
  }

  function addSite(value = siteDraft) {
    const domain = normalizeDomain(value)
    if (!domain) {
      setFormError('Enter a valid website domain, such as youtube.com.')
      return
    }
    setDraft((current) => ({
      ...current,
      sites: current.sites.includes(domain) ? current.sites : [...current.sites, domain],
    }))
    setSiteDraft('')
    setFormError('')
  }

  function removeSite(domain) {
    setDraft((current) => ({ ...current, sites: current.sites.filter((site) => site !== domain) }))
  }

  async function saveProfile(event) {
    event.preventDefault()
    const name = draft.name.trim()
    const workMin = Number(draft.workMin)
    const breakMin = Number(draft.breakMin)
    const rounds = Number(draft.rounds)
    if (!name) {
      setFormError('Give this profile a name.')
      return
    }
    if (!Number.isInteger(workMin) || workMin < 1 || workMin > 480) {
      setFormError('Focus time must be a whole number between 1 and 480 minutes.')
      return
    }
    if (!Number.isInteger(breakMin) || breakMin < 1 || breakMin > 60) {
      setFormError('Break time must be a whole number between 1 and 60 minutes.')
      return
    }
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 12) {
      setFormError('Rounds must be a whole number between 1 and 12.')
      return
    }

    const payload = {
      ...(editing !== 'new' && draft.id ? { id: draft.id } : {}),
      name,
      color: draft.color,
      mode: draft.mode,
      workMin,
      breakMin,
      rounds,
      apps: draft.apps,
      sites: draft.sites,
    }
    setSaving(true)
    setFormError('')
    try {
      const result = await api.saveProfile(payload)
      const conflicts = conflictMessages(result)
      if (conflicts.length) {
        setFormError(conflicts.join(' '))
        return
      }
      setEditing(null)
    } catch (error) {
      const message = error?.message || 'Could not save this profile.'
      setFormError(message)
      onError(message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteProfile() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.deleteProfile(deleting.id)
      setDeleting(null)
    } catch (error) {
      const message = error?.message || 'Could not delete this profile.'
      setDeleteError(message)
      onError(message)
    } finally {
      setDeleteBusy(false)
    }
  }

  function duplicateProfile(profile) {
    setEditing('new')
    setDraft(copyProfile(profile))
    setSiteDraft('')
    setAppQuery('')
    setFormError('')
  }

  return (
    <div className="profiles-view">
      <div className="planning-header">
        <div>
          <p className="eyebrow">Planning</p>
          <h1>Profiles</h1>
          <p className="muted">Save a focus setup once, then reuse it for sessions and schedules.</p>
        </div>
        <button className="button primary" type="button" onClick={openNew}>
          <Plus size={16} aria-hidden="true" />
          New profile
        </button>
      </div>

      {state?.session && (
        <div className="planning-notice" role="status">
          <Info size={16} aria-hidden="true" />
          <span>Profile changes apply to future sessions. The active session keeps its current commitments.</span>
        </div>
      )}

      {!state ? (
        <div className="panel planning-empty" role="status">Loading profiles…</div>
      ) : profiles.length === 0 ? (
        <div className="panel planning-empty">
          <ShieldCheck size={24} aria-hidden="true" />
          <strong>No profiles yet</strong>
          <span className="muted">Create one to save your apps, websites, and timing preferences.</span>
          <button className="button primary" type="button" onClick={openNew}>
            <Plus size={16} aria-hidden="true" /> Create profile
          </button>
        </div>
      ) : (
        <div className="profile-list">
          {profiles.map((profile) => {
            const attachedSchedules = schedules.filter((schedule) => schedule.profileId === profile.id).length
            return (
              <article className="panel profile-card" key={profile.id}>
                <div className="profile-card-main">
                  <span className="profile-color" style={{ backgroundColor: profile.color }} aria-hidden="true" />
                  <div className="profile-title-wrap">
                    <h2>{profile.name}</h2>
                    <span className="profile-mode">{profile.mode === 'pomodoro' ? 'Pomodoro' : 'Single focus block'}</span>
                  </div>
                </div>
                <div className="profile-counts" aria-label={`${profile.apps?.length || 0} apps and ${profile.sites?.length || 0} websites`}>
                  <span><AppWindow size={15} aria-hidden="true" /> {profile.apps?.length || 0} apps</span>
                  <span><Globe2 size={15} aria-hidden="true" /> {profile.sites?.length || 0} sites</span>
                  <span>{profile.mode === 'pomodoro' ? `${profile.workMin}/${profile.breakMin} min × ${profile.rounds}` : `${profile.workMin} min`}</span>
                </div>
                <div className="profile-card-actions">
                  <button className="button" type="button" onClick={() => openEdit(profile)}>
                    <Pencil size={15} aria-hidden="true" /> Edit
                  </button>
                  <button className="icon-button" type="button" aria-label={`Duplicate ${profile.name}`} title="Duplicate" onClick={() => duplicateProfile(profile)}>
                    <Copy size={16} aria-hidden="true" />
                  </button>
                  <button className="icon-button danger" type="button" aria-label={`Delete ${profile.name}`} title="Delete" onClick={() => { setDeleting(profile); setDeleteError('') }}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeForm()}>
          <ModalDialog className="modal profile-modal" onClose={closeForm} aria-labelledby="profile-modal-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Profile</p>
                <h2 id="profile-modal-title">{editing === 'new' ? 'New profile' : 'Edit profile'}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close" onClick={closeForm}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={saveProfile}>
              <div className="planning-form-grid">
                <div className="field">
                  <label htmlFor="profile-name">Profile name</label>
                  <input className="input" id="profile-name" value={draft.name} maxLength={80} autoFocus onChange={(event) => updateDraft('name', event.target.value)} />
                </div>
                <fieldset className="planning-fieldset">
                  <legend>Color</legend>
                  <div className="color-options">
                    {COLORS.map((color) => (
                      <label className="color-option" key={color.value} title={color.label}>
                        <input type="radio" name="profile-color" value={color.value} checked={draft.color === color.value} onChange={() => updateDraft('color', color.value)} />
                        <span className="color-dot" style={{ backgroundColor: color.value }} />
                        <span className="sr-only">{color.label}</span>
                        {draft.color === color.value && <Check size={12} aria-hidden="true" />}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              <fieldset className="planning-fieldset">
                <legend>Timing</legend>
                <div className="segmented-control" role="group" aria-label="Timing mode">
                  <button type="button" aria-pressed={draft.mode === 'focus'} onClick={() => updateDraft('mode', 'focus')}>Single focus</button>
                  <button type="button" aria-pressed={draft.mode === 'pomodoro'} onClick={() => updateDraft('mode', 'pomodoro')}>Pomodoro</button>
                </div>
                <div className="timing-fields">
                  <div className="field">
                    <label htmlFor="profile-work">{draft.mode === 'pomodoro' ? 'Work (minutes)' : 'Focus (minutes)'}</label>
                    <input className="input" id="profile-work" type="number" min="1" max="480" value={draft.workMin} onChange={(event) => updateDraft('workMin', event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="profile-break">Break (minutes)</label>
                    <input className="input" id="profile-break" type="number" min="1" max="60" value={draft.breakMin} disabled={draft.mode !== 'pomodoro'} onChange={(event) => updateDraft('breakMin', event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="profile-rounds">Rounds</label>
                    <input className="input" id="profile-rounds" type="number" min="1" max="12" value={draft.rounds} disabled={draft.mode !== 'pomodoro'} onChange={(event) => updateDraft('rounds', event.target.value)} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="planning-fieldset">
                <legend>Blocked apps</legend>
                <div className="picker-toolbar">
                  <label className="search-field" htmlFor="profile-app-search">
                    <Search size={15} aria-hidden="true" />
                    <span className="sr-only">Search apps</span>
                    <input id="profile-app-search" value={appQuery} placeholder="Search installed apps" onChange={(event) => setAppQuery(event.target.value)} />
                  </label>
                  <button className="button" type="button" onClick={chooseApp}><Plus size={15} aria-hidden="true" /> Choose app</button>
                </div>
                {draft.apps.length > 0 && (
                  <div className="selection-chips" aria-label="Selected apps">
                    {draft.apps.map((app) => <span className="selection-chip" key={appKey(app)}>{appName(app)}<button type="button" aria-label={`Remove ${appName(app)}`} onClick={() => toggleApp(app)}><X size={13} aria-hidden="true" /></button></span>)}
                  </div>
                )}
                <div className="app-picker" aria-live="polite">
                  {appsLoading ? <p className="muted">Loading installed apps…</p> : visibleApps.length === 0 ? <p className="muted">No apps match this search.</p> : visibleApps.map((app) => {
                    const selected = draft.apps.some((current) => appKey(current) === appKey(app))
                    return <button className={`app-picker-row${selected ? ' selected' : ''}`} type="button" key={appKey(app)} disabled={app.protected} aria-pressed={selected} onClick={() => toggleApp(app)} title={app.protected ? 'This app is protected' : app.bundlePath || app.bundleId}>
                      <span className="app-avatar">{initials(appName(app))}</span><span className="app-picker-name">{appName(app)}</span>{app.protected ? <span className="muted">Protected</span> : selected ? <Check size={15} aria-hidden="true" /> : null}
                    </button>
                  })}
                </div>
              </fieldset>

              <fieldset className="planning-fieldset">
                <legend>Blocked websites</legend>
                <div className="site-entry">
                  <label className="search-field" htmlFor="profile-site-entry"><Globe2 size={15} aria-hidden="true" /><span className="sr-only">Add website</span><input id="profile-site-entry" value={siteDraft} placeholder="youtube.com" onChange={(event) => setSiteDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSite() } }} /></label>
                  <button className="button" type="button" onClick={() => addSite()}>Add site</button>
                </div>
                {draft.sites.length > 0 && <div className="selection-chips" aria-label="Selected websites">{draft.sites.map((site) => <span className="selection-chip" key={site}>{site}<button type="button" aria-label={`Remove ${site}`} onClick={() => removeSite(site)}><X size={13} aria-hidden="true" /></button></span>)}</div>}
              </fieldset>

              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="modal-actions">
                <button className="button" type="button" onClick={closeForm} disabled={saving}>Cancel</button>
                <button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
              </div>
            </form>
          </ModalDialog>
        </div>
      )}

      {deleting && (
        <div className="modal-backdrop" role="presentation">
          <ModalDialog className="modal confirm-modal" role="alertdialog" onClose={() => !deleteBusy && setDeleting(null)} aria-labelledby="delete-profile-title">
            <div className="modal-heading"><div><p className="eyebrow">Delete profile</p><h2 id="delete-profile-title">Delete “{deleting.name}”?</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setDeleting(null)}><X size={18} aria-hidden="true" /></button></div>
            {schedules.filter((schedule) => schedule.profileId === deleting.id).length > 0 && <p className="planning-warning"><Info size={16} aria-hidden="true" /> This profile has {schedules.filter((schedule) => schedule.profileId === deleting.id).length} attached schedule{schedules.filter((schedule) => schedule.profileId === deleting.id).length === 1 ? '' : 's'}. The engine will refuse deletion while those references exist.</p>}
            <p className="muted">Future sessions using this profile will need another saved profile. Active commitments are unchanged.</p>
            {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
            <div className="modal-actions"><button className="button" type="button" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button><button className="button danger" type="button" onClick={deleteProfile} disabled={deleteBusy}>{deleteBusy ? 'Deleting…' : 'Delete profile'}</button></div>
          </ModalDialog>
        </div>
      )}
    </div>
  )
}
