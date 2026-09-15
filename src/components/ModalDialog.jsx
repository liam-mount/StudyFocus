import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => element.getClientRects().length > 0)
}

/** Keeps keyboard focus in an open dialog and returns it to its opener on close. */
export function useModalFocus(onClose) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusInitial = () => {
      const initial = dialog.querySelector('[data-modal-autofocus], [autofocus]')
      const target = initial && !initial.disabled ? initial : focusableElements(dialog)[0] || dialog
      target.focus()
    }
    const frame = window.requestAnimationFrame(focusInitial)
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const targets = focusableElements(dialog)
      if (!targets.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = targets[0]
      const last = targets[targets.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return dialogRef
}

export default function ModalDialog({ children, className = 'modal', onClose, role = 'dialog', ...props }) {
  const dialogRef = useModalFocus(onClose)
  return <div ref={dialogRef} className={className} role={role} aria-modal="true" tabIndex={-1} {...props}>{children}</div>
}
