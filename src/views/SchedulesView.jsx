import { useMemo, useState } from 'react'
import { CalendarDays, Check, Clock3, Info, Pencil, Plus, Trash2, X } from 'lucide-react'
import { api } from '../api.js'
import ModalDialog from '../components/ModalDialog.jsx'

const WEEKDAYS = [
  { value: 0, short: 'Sun', long: 'Sunday' },
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
]

const DEFAULT_SCHEDULE = { profileId: '', days: [1, 2, 3, 4, 5], time: '09:00', enabled: true }

function conflictMessages(result) {
  const candidates = [result?.conflicts, result?.error?.conflicts, result?.data?.conflicts]
  const conflicts = candidates.find((value) => Array.isArray(value))
  if (!conflicts) return []
  return conflicts.map((conflict) => {
    if (typeof conflict === 'string') return conflict
    return conflict?.message || conflict?.detail || conflict?.reason || JSON.stringify(conflict)
  })
}

function displayNextRun(nextRun) {
  if (!nextRun) return 'No upcoming run'
  const value = Number(nextRun)
  if (!Number.isFinite(value)) return 'No upcoming run'
  const date = new Date(value < 1e12 ? value * 1000 : value)
  if (Number.isNaN(date.getTime())) return 'No upcoming run'
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function scheduleTime(schedule) {
  const [hour, minute] = String(schedule.time || '').split(':').map(Number)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return schedule.time || '—'
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function dayNames(days) {
  const chosen = WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.short)
  if (chosen.length === 7) return 'Every day'
  if (chosen.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return 'Weekdays'
  if (chosen.length === 2 && [0, 6].every((day) => days.includes(day))) return 'Weekends'
  return chosen.join(' · ') || 'No days'
}

function sortSchedules(schedules) {
  return [...schedules].sort((a, b) => {
    const nextA = a.nextRun == null ? Number.POSITIVE_INFINITY : Number(a.nextRun)
    const nextB = b.nextRun == null ? Number.POSITIVE_INFINITY : Number(b.nextRun)
    if (nextA !== nextB) return nextA - nextB
    return String(a.time || '').localeCompare(String(b.time || ''))
  })
}

export default function SchedulesView({ state, onError = () => {} }) {
  const schedules = state?.schedules || []
  const profiles = state?.profiles || []
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(DEFAULT_SCHEDULE)
  const [formError, setFormError] = useState('')
  const [conflicts, setConflicts] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [toggleId, setToggleId] = useState(null)

  const profileNames = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile.name])), [profiles])
  const orderedSchedules = useMemo(() => sortSchedules(schedules), [schedules])

  function openNew() {
    setEditing('new')
    setDraft({ ...DEFAULT_SCHEDULE, days: [...DEFAULT_SCHEDULE.days], profileId: profiles[0]?.id || '' })
    setFormError('')
    setConflicts([])
  }

  function openEdit(schedule) {
    setEditing(schedule.id)
    setDraft({ ...DEFAULT_SCHEDULE, ...schedule, days: [...(schedule.days || [])] })
    setFormError('')
    setConflicts([])
  }

  function closeForm() {
    if (saving) return
    setEditing(null)
    setFormError('')
    setConflicts([])
  }

  function toggleDay(day) {
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((value) => value !== day) : [...current.days, day].sort((a, b) => a - b),
    }))
  }

  async function saveSchedule(event) {
    event.preventDefault()
    if (!draft.profileId) {
      setFormError('Choose a profile for this schedule.')
      return
    }
    if (!draft.days.length) {
      setFormError('Choose at least one weekday.')
      return
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
      setFormError('Enter a time in 24-hour HH:mm format.')
      return
    }
    const payload = {
      ...(editing !== 'new' && draft.id ? { id: draft.id } : {}),
      profileId: draft.profileId,
      days: [...draft.days].sort((a, b) => a - b),
      time: draft.time,
      enabled: Boolean(draft.enabled),
    }
    setSaving(true)
    setFormError('')
    setConflicts([])
    try {
      const result = await api.saveSchedule(payload)
      const returnedConflicts = conflictMessages(result)
      if (returnedConflicts.length) {
        setConflicts(returnedConflicts)
        return
      }
      setEditing(null)
    } catch (error) {
      const message = error?.message || 'Could not save this schedule.'
      const returnedConflicts = conflictMessages(error)
      if (returnedConflicts.length) setConflicts(returnedConflicts)
      setFormError(message)
      onError(message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleSchedule(schedule) {
    setToggleId(schedule.id)
    try {
      await api.saveSchedule({
        id: schedule.id,
        profileId: schedule.profileId,
        days: [...(schedule.days || [])],
        time: schedule.time,
        enabled: !schedule.enabled,
      })
    } catch (error) {
      const message = error?.message || 'Could not update this schedule.'
      onError(message)
    } finally {
      setToggleId(null)
    }
  }

  async function deleteSchedule() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.deleteSchedule(deleting.id)
      setDeleting(null)
    } catch (error) {
      const message = error?.message || 'Could not delete this schedule.'
      setDeleteError(message)
      onError(message)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="schedules-view">
      <div className="planning-header">
        <div>
          <p className="eyebrow">Planning</p>
          <h1>Schedules</h1>
          <p className="muted">Start saved profiles on a weekly rhythm when your study day begins.</p>
        </div>
        <button className="button primary" type="button" onClick={openNew}><Plus size={16} aria-hidden="true" /> New schedule</button>
      </div>

      <div className="planning-notice" role="note">
        <Info size={16} aria-hidden="true" />
        <span>Missed starts are skipped. An active commitment stays intact when schedules change.</span>
      </div>

      {!state ? (
        <div className="panel planning-empty" role="status">Loading schedules…</div>
      ) : profiles.length === 0 ? (
        <div className="panel planning-empty">
          <CalendarDays size={24} aria-hidden="true" />
          <strong>Create a profile first</strong>
          <span className="muted">Schedules run a saved profile, so add one before setting a start time.</span>
        </div>
      ) : schedules.length === 0 ? (
        <div className="panel planning-empty">
          <Clock3 size={24} aria-hidden="true" />
          <strong>No schedules yet</strong>
          <span className="muted">Add a weekday and time for a profile to start automatically.</span>
          <button className="button primary" type="button" onClick={openNew}><Plus size={16} aria-hidden="true" /> Create schedule</button>
        </div>
      ) : (
        <div className="schedule-list">
          {orderedSchedules.map((schedule) => (
            <article className={`panel schedule-card${schedule.enabled ? '' : ' disabled'}`} key={schedule.id}>
              <div className="schedule-time"><strong>{scheduleTime(schedule)}</strong><span>{dayNames(schedule.days || [])}</span></div>
              <div className="schedule-details"><h2>{profileNames.get(schedule.profileId) || 'Missing profile'}</h2><span className="next-run"><Clock3 size={14} aria-hidden="true" /> {schedule.enabled ? `Next: ${displayNextRun(schedule.nextRun)}` : 'Paused'}</span></div>
              <div className="schedule-actions">
                <button className={`schedule-toggle${schedule.enabled ? ' on' : ''}`} type="button" role="switch" aria-checked={Boolean(schedule.enabled)} disabled={toggleId === schedule.id} onClick={() => toggleSchedule(schedule)}><span className="toggle-knob" /><span className="sr-only">{schedule.enabled ? 'Disable' : 'Enable'} schedule</span></button>
                <button className="icon-button" type="button" aria-label={`Edit schedule for ${profileNames.get(schedule.profileId) || 'missing profile'}`} title="Edit" onClick={() => openEdit(schedule)}><Pencil size={16} aria-hidden="true" /></button>
                <button className="icon-button danger" type="button" aria-label="Delete schedule" title="Delete" onClick={() => { setDeleting(schedule); setDeleteError('') }}><Trash2 size={16} aria-hidden="true" /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeForm()}>
          <ModalDialog className="modal schedule-modal" onClose={closeForm} aria-labelledby="schedule-modal-title">
            <div className="modal-heading"><div><p className="eyebrow">Schedule</p><h2 id="schedule-modal-title">{editing === 'new' ? 'New schedule' : 'Edit schedule'}</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={closeForm}><X size={18} aria-hidden="true" /></button></div>
            <form onSubmit={saveSchedule}>
              <div className="field"><label htmlFor="schedule-profile">Profile</label><select className="input" id="schedule-profile" value={draft.profileId} onChange={(event) => setDraft((current) => ({ ...current, profileId: event.target.value }))}><option value="">Choose a profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></div>
              <fieldset className="planning-fieldset schedule-days-fieldset"><legend>Weekdays</legend><div className="weekday-picker">{WEEKDAYS.map((day) => <button className={`weekday-button${draft.days.includes(day.value) ? ' selected' : ''}`} type="button" key={day.value} aria-pressed={draft.days.includes(day.value)} aria-label={day.long} onClick={() => toggleDay(day.value)}>{draft.days.includes(day.value) && <Check size={13} aria-hidden="true" />}{day.short}</button>)}</div></fieldset>
              <div className="schedule-form-row"><div className="field"><label htmlFor="schedule-time">Start time</label><input className="input" id="schedule-time" type="time" value={draft.time} onChange={(event) => setDraft((current) => ({ ...current, time: event.target.value }))} /></div><label className="checkbox-field"><input type="checkbox" checked={Boolean(draft.enabled)} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /> <span>Enabled</span></label></div>
              {conflicts.length > 0 && <div className="conflict-box" role="alert"><strong>Schedule conflicts</strong><p>The engine found an overlap. Choose another time or weekday.</p><ul>{conflicts.map((conflict, index) => <li key={`${conflict}-${index}`}>{conflict}</li>)}</ul></div>}
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="button" type="button" onClick={closeForm} disabled={saving}>Cancel</button><button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</button></div>
            </form>
          </ModalDialog>
        </div>
      )}

      {deleting && (
        <div className="modal-backdrop" role="presentation"><ModalDialog className="modal confirm-modal" role="alertdialog" onClose={() => !deleteBusy && setDeleting(null)} aria-labelledby="delete-schedule-title"><div className="modal-heading"><div><p className="eyebrow">Delete schedule</p><h2 id="delete-schedule-title">Delete this schedule?</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={() => setDeleting(null)}><X size={18} aria-hidden="true" /></button></div><p className="muted">{profileNames.get(deleting.profileId) || 'This profile'} will no longer start at {scheduleTime(deleting)} on {dayNames(deleting.days || []).toLowerCase()}.</p>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<div className="modal-actions"><button className="button" type="button" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</button><button className="button danger" type="button" onClick={deleteSchedule} disabled={deleteBusy}>{deleteBusy ? 'Deleting…' : 'Delete schedule'}</button></div></ModalDialog></div>
      )}
    </div>
  )
}
