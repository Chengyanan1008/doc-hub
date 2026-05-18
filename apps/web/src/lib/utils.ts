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
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // Avoid scrolling to bottom / flashing on screen
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.width = '1px'
    ta.style.height = '1px'
    ta.style.padding = '0'
    ta.style.border = 'none'
    ta.style.outline = 'none'
    ta.style.boxShadow = 'none'
    ta.style.background = 'transparent'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
