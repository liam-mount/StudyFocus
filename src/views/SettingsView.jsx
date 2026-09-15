import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Chrome,
  Download,
  ExternalLink,
  FolderOpen,
  Info,
  Loader2,
  Monitor,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
  Wrench,
} from 'lucide-react'
import { api } from '../api.js'
import ModalDialog from '../components/ModalDialog.jsx'
import './history-settings.css'

const VERSION = '1.0.0-beta.1'

function resultMessage(result, fallback) {
  if (result?.message) return result.message
  if (result?.path) return `Data is available at ${result.path}`
  if (result?.extensionId) return `Chrome extension ID: ${result.extensionId}`
  return fallback
}

function serviceLabel(status) {
  const value = typeof status === 'string' ? status : status?.status
  if (value === 'active' || value === 'running' || value === 'installed') return 'Installed and running'
  if (value === 'stopped' || value === 'inactive') return 'Installed, but stopped'
  if (value === 'missing' || value === 'not-installed') return 'Not installed'
  return value ? String(value) : 'Status unavailable'
}

function lastSeenLabel(lastSeen, now) {
  if (!lastSeen) return 'Not seen yet'
  const minutes = Math.max(0, Math.round(((now || Date.now()) - lastSeen) / 60000))
  if (minutes < 1) return 'Seen just now'
  if (minutes === 1) return 'Seen 1 minute ago'
  return `Seen ${minutes} minutes ago`
}

export default function SettingsView({ state, onError }) {
  const [localSettings, setLocalSettings] = useState({})
  const [serviceStatus, setServiceStatus] = useState(null)
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState(null)
  const [confirmUninstall, setConfirmUninstall] = useState(false)

  const settings = { ...(state?.settings ?? {}), ...localSettings }
  const health = state?.health ?? {}
  const chromeClients = health.chrome ?? []
  const hasLegacy = Boolean(state?.legacyAvailable)
  const enabledSchedules = (state?.schedules ?? []).filter((schedule) => schedule.enabled).length

  useEffect(() => {
    let current = true
    api.serviceStatus()
      .then((result) => { if (current) setServiceStatus(result) })
      .catch((error) => { if (current) setToast({ type: 'error', message: error?.message || 'Could not read background service status.' }) })
    return () => { current = false }
  }, [])

  const serviceSummary = useMemo(() => serviceStatus ?? { status: health.engine ? 'active' : 'missing' }, [health.engine, serviceStatus])

  function showError(error, fallback) {
    const message = error?.message || fallback
    setToast({ type: 'error', message })
    onError?.(message)
  }

  async function runAction(name, action, successMessage) {
    setBusy(name)
    setToast(null)
    try {
      const result = await action()
      if (name === 'service-status') setServiceStatus(result)
      const message = resultMessage(result, successMessage)
      if (message) setToast({ type: 'success', message })
      return result
    } catch (error) {
      showError(error, successMessage)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function saveSetting(partial) {
    const key = Object.keys(partial)[0]
    setBusy(`setting-${key}`)
    setToast(null)
    try {
      const result = await api.saveSettings(partial)
      setLocalSettings((current) => ({ ...current, ...partial }))
      if (result?.settings) setLocalSettings((current) => ({ ...current, ...result.settings }))
      if (result?.message) setToast({ type: 'success', message: result.message })
    } catch (error) {
      showError(error, 'Could not save that setting.')
    } finally {
      setBusy(null)
    }
  }

  async function uninstall() {
    setConfirmUninstall(false)
    await runAction('service-uninstall', api.uninstallService, 'Background service uninstalled.')
    await runAction('service-status', api.serviceStatus, '')
  }

  return (
    <main className="sf-settings" aria-labelledby="settings-title">
      <div className="sf-view-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 id="settings-title">Make StudyFocus yours.</h1>
          <p className="muted">Small adjustments, with the same local-first focus.</p>
        </div>
      </div>

      {toast && (
        <div className={`sf-toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
          {toast.type === 'success' ? <CheckCircle2 aria-hidden="true" size={16} /> : <AlertCircle aria-hidden="true" size={16} />}
          <span>{toast.message}</span>
          <button type="button" className="sf-toast-dismiss" aria-label="Dismiss message" onClick={() => setToast(null)}><X aria-hidden="true" size={16} /></button>
        </div>
      )}

      <section className="panel sf-panel" aria-labelledby="appearance-title">
        <div className="sf-panel-heading"><div><p className="eyebrow">Interface</p><h2 id="appearance-title">Appearance</h2></div><Monitor aria-hidden="true" size={19} /></div>
        <div className="sf-choice-grid" role="group" aria-label="Appearance">
          {[
            ['system', 'System', Monitor],
            ['light', 'Light', Sun],
            ['dark', 'Dark', Moon],
          ].map(([value, label, Icon]) => (
            <button key={value} type="button" className={`sf-choice ${settings.appearance === value ? 'selected' : ''}`} aria-pressed={settings.appearance === value} disabled={busy === 'setting-appearance'} onClick={() => saveSetting({ appearance: value })}>
              <Icon aria-hidden="true" size={17} /><span>{label}</span>{settings.appearance === value && <CheckCircle2 aria-hidden="true" size={16} />}
            </button>
          ))}
        </div>
        <button type="button" className="sf-toggle-row" role="switch" aria-checked={Boolean(settings.notifications)} onClick={() => saveSetting({ notifications: !settings.notifications })} disabled={busy === 'setting-notifications'}>
          <span className="sf-toggle-icon"><Bell aria-hidden="true" size={17} /></span><span className="sf-toggle-copy"><strong>Notifications</strong><small>Let StudyFocus tell you when a session changes phase or finishes.</small></span><span className={`sf-toggle ${settings.notifications ? 'on' : ''}`} aria-hidden="true"><span /></span>
        </button>
      </section>

      <section className="panel sf-panel" aria-labelledby="service-title">
        <div className="sf-panel-heading"><div><p className="eyebrow">Enforcement</p><h2 id="service-title">Background service</h2></div><span className={`sf-status-pill ${health.engine ? 'success' : 'muted'}`}><span />{serviceLabel(serviceSummary)}</span></div>
        <p className="muted">The background service keeps schedules and app blocking available while the StudyFocus window is closed.</p>
        {health.error && <p className="sf-inline-error"><AlertCircle aria-hidden="true" size={15} />{health.error}</p>}
        <div className="sf-action-row">
          <button type="button" className="button primary" disabled={busy === 'service-install'} onClick={() => runAction('service-install', api.installService, 'Background service installed.')}><Wrench aria-hidden="true" size={16} />{busy === 'service-install' ? 'Installing…' : 'Install'}</button>
          <button type="button" className="button" disabled={busy === 'service-repair'} onClick={() => runAction('service-repair', api.repairService, 'Background service repaired.')}><RefreshCw aria-hidden="true" size={16} />{busy === 'service-repair' ? 'Repairing…' : 'Repair'}</button>
          <button type="button" className="button danger" disabled={busy === 'service-uninstall'} onClick={() => setConfirmUninstall(true)}><Trash2 aria-hidden="true" size={16} />Uninstall</button>
          <button type="button" className="button" disabled={busy === 'service-status'} onClick={() => runAction('service-status', api.serviceStatus, '')}><RefreshCw aria-hidden="true" size={16} />{busy === 'service-status' ? 'Checking…' : 'Check status'}</button>
        </div>
      </section>

      <section className="panel sf-panel" aria-labelledby="chrome-title">
        <div className="sf-panel-heading"><div><p className="eyebrow">Websites</p><h2 id="chrome-title">Chrome setup</h2></div><Chrome aria-hidden="true" size={19} /></div>
        <p className="muted">The Chrome connector extends enforcement to browser tabs. Incognito coverage is shown per connected client.</p>
        <div className="sf-beta-note"><Info aria-hidden="true" size={16} /><span>The beta extension store is not live yet. Install returns the setup details StudyFocus has for this build; use Open extension to review them.</span></div>
        <button type="button" className="sf-toggle-row" role="switch" aria-checked={Boolean(settings.systemSites)} disabled={Boolean(state?.session) || busy === 'setting-systemSites'} onClick={() => saveSetting({ systemSites: !settings.systemSites })}>
          <span className="sf-toggle-icon"><ShieldCheck aria-hidden="true" size={17} /></span><span className="sf-toggle-copy"><strong>System website blocking</strong><small>Also block exact domains across browsers. Requires a macOS administrator prompt when a session starts. Chrome extension provides full subdomain coverage.</small></span><span className={`sf-toggle ${settings.systemSites ? 'on' : ''}`} aria-hidden="true"><span /></span>
        </button>
        <div className="sf-action-row">
          <button type="button" className="button primary" disabled={busy === 'chrome-install'} onClick={() => runAction('chrome-install', api.installChrome, 'Chrome setup details are ready.')}><Download aria-hidden="true" size={16} />{busy === 'chrome-install' ? 'Preparing…' : 'Install Chrome connector'}</button>
          <button type="button" className="button" disabled={busy === 'chrome-open'} onClick={() => runAction('chrome-open', api.openExtension, 'Chrome extension details opened.')}><ExternalLink aria-hidden="true" size={16} />{busy === 'chrome-open' ? 'Opening…' : 'Open extension'}</button>
        </div>
        {chromeClients.length ? <div className="sf-client-list">{chromeClients.map((client) => <div className="sf-client" key={client.id}><span className={`sf-client-dot ${client.error ? 'danger' : health.chromeReady ? 'success' : 'muted'}`} /><span className="sf-client-copy"><strong>{client.name || 'Chrome client'}</strong><small>{lastSeenLabel(client.lastSeen, state?.now)} · revision {client.revision ?? '—'}</small></span><span className={`sf-incognito ${client.incognito ? 'ready' : ''}`}>{client.incognito ? 'Incognito covered' : 'Incognito off'}</span>{client.error && <span className="sf-client-error" title={client.error}><AlertCircle aria-label={client.error} size={16} /></span>}</div>)}</div> : <p className="sf-empty-inline">No Chrome client has connected yet.</p>}
      </section>

      {hasLegacy && <section className="panel sf-panel" aria-labelledby="migration-title"><div className="sf-panel-heading"><div><p className="eyebrow">Migration</p><h2 id="migration-title">Bring over legacy data</h2></div><Upload aria-hidden="true" size={19} /></div><p className="muted">StudyFocus found data from an earlier local version. Import it into this profile when you are ready.</p><button type="button" className="button" disabled={busy === 'legacy-import'} onClick={() => runAction('legacy-import', api.importLegacy, 'Legacy data imported.')}><Upload aria-hidden="true" size={16} />{busy === 'legacy-import' ? 'Importing…' : 'Import legacy data'}</button></section>}

      <section className="panel sf-panel" aria-labelledby="data-title"><div className="sf-panel-heading"><div><p className="eyebrow">Your data</p><h2 id="data-title">Data and privacy</h2></div><ShieldCheck aria-hidden="true" size={19} /></div><p className="muted">StudyFocus keeps your sessions and settings on this Mac. Export a portable copy or open the local data folder.</p><div className="sf-action-row"><button type="button" className="button" disabled={busy === 'data-export'} onClick={() => runAction('data-export', api.exportData, 'Your StudyFocus data is ready.')}><Download aria-hidden="true" size={16} />{busy === 'data-export' ? 'Exporting…' : 'Export data'}</button><button type="button" className="button" disabled={busy === 'data-open'} onClick={() => runAction('data-open', api.openData, 'Data folder opened.')}><FolderOpen aria-hidden="true" size={16} />{busy === 'data-open' ? 'Opening…' : 'Open data folder'}</button></div></section>

      <section className="sf-about" aria-labelledby="about-title"><Info aria-hidden="true" size={18} /><div><h2 id="about-title">StudyFocus</h2><p>Version {VERSION} · Local privacy by default. Your focus history stays on this Mac unless you export it.</p></div></section>

      {confirmUninstall && <div className="modal-backdrop" role="presentation"><ModalDialog className="sf-confirm-modal modal" onClose={() => busy !== 'service-uninstall' && setConfirmUninstall(false)} aria-labelledby="uninstall-title"><div className="sf-modal-icon"><Trash2 aria-hidden="true" size={20} /></div><h2 id="uninstall-title">Uninstall background service?</h2><p>This removes the service that runs enforcement in the background. If a session is active or schedules are enabled ({enabledSchedules}), the engine may reject the request; its returned message will be shown here.</p><div className="sf-modal-actions"><button type="button" className="button" onClick={() => setConfirmUninstall(false)}>Cancel</button><button type="button" className="button danger" disabled={busy === 'service-uninstall'} onClick={uninstall}>{busy === 'service-uninstall' ? <Loader2 aria-hidden="true" className="sf-spin" size={16} /> : <Trash2 aria-hidden="true" size={16} />} Uninstall service</button></div></ModalDialog></div>}
    </main>
  )
}
