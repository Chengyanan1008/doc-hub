import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(b: number) {
  if (!b) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

/**
 * Copy text to clipboard with broad compatibility.
 *
 * - Prefers the modern async Clipboard API (`navigator.clipboard.writeText`),
 *   which only works in **secure contexts** (HTTPS / localhost).
 * - Falls back to the legacy `document.execCommand('copy')` via a temporary
 *   <textarea>, so it also works on plain HTTP origins (e.g. internal IP) and
 *   older browsers.
 *
 * Returns `true` on success, `false` if every strategy failed. Never throws,
 * so the caller can decide how to react (toast / alert / silent).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (text == null) return false

  // 1) Modern API — only available in secure contexts (HTTPS / localhost).
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to legacy path
    }
  }

  // 2) Legacy fallback — works on http:// origins as long as it is invoked
  //    inside a user gesture (click handler etc.).
  if (typeof document === 'undefined') return false
  const value = String(text)
  const ta = document.createElement('textarea')
  try {
    ta.value = value
    // Avoid scrolling to bottom / flashing on screen
    ta.setAttribute('readonly', '')
    ta.setAttribute('aria-hidden', 'true')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '-9999px'
    ta.style.width = '1px'
    ta.style.height = '1px'
    ta.style.padding = '0'
    ta.style.border = 'none'
    ta.style.outline = 'none'
    ta.style.boxShadow = 'none'
    ta.style.background = 'transparent'
    document.body.appendChild(ta)
    ta.focus({ preventScroll: true })
    ta.select()
    ta.setSelectionRange(0, ta.value.length)

    let copied = false
    const onCopy = (event: ClipboardEvent) => {
      event.preventDefault()
      event.clipboardData?.setData('text/plain', value)
      copied = true
    }

    document.addEventListener('copy', onCopy)
    try {
      copied = document.execCommand('copy') || copied
    } finally {
      document.removeEventListener('copy', onCopy)
    }

    return copied
  } catch {
    return false
  } finally {
    if (ta.parentNode) ta.parentNode.removeChild(ta)
  }
}
