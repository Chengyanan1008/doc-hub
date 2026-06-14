import { create } from 'zustand'
import { Auth, getToken, setToken, type AuthUser } from '@/lib/api'
import { resetSidebarPreference } from '@/store/docs'

interface AuthState {
  user: AuthUser | null
  token: string | null
  loading: boolean
  registerEnabled: boolean
  loginOpen: boolean
  loginMode: 'login' | 'register'

  bootstrap: () => Promise<void>
  openLogin: (mode?: 'login' | 'register') => void
  closeLogin: () => void
  login: (username: string, password: string) => Promise<void>
  register: (p: { username: string; password: string; email?: string; displayName?: string }) => Promise<void>
  logout: () => void
}

function shouldReloadDocRouteAfterAuth(): boolean {
  if (typeof window === 'undefined') return false
  return /(^|\/)v\/[^/]+/.test(window.location.pathname)
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: getToken(),
  loading: false,
  registerEnabled: true,
  loginOpen: false,
  loginMode: 'login',

  bootstrap: async () => {
    try {
      const info = await Auth.publicInfo()
      set({ registerEnabled: info.registerEnabled })
    } catch {/* ignore */}
    if (!getToken()) return
    try {
      const u = await Auth.me()
      set({ user: u })
    } catch {
      setToken(null)
      set({ user: null, token: null })
    }
  },

  openLogin: (mode = 'login') => set({ loginOpen: true, loginMode: mode }),
  closeLogin: () => set({ loginOpen: false }),

  login: async (username, password) => {
    set({ loading: true })
    try {
      const reloadAfterAuth = shouldReloadDocRouteAfterAuth()
      const { user, token } = await Auth.login({ username, password })
      setToken(token)
      resetSidebarPreference()
      set({ user, token, loginOpen: false })
      if (reloadAfterAuth) window.location.reload()
    } finally {
      set({ loading: false })
    }
  },

  register: async (p) => {
    set({ loading: true })
    try {
      const reloadAfterAuth = shouldReloadDocRouteAfterAuth()
      const { user, token } = await Auth.register(p)
      setToken(token)
      resetSidebarPreference()
      set({ user, token, loginOpen: false })
      if (reloadAfterAuth) window.location.reload()
    } finally {
      set({ loading: false })
    }
  },

  logout: () => {
    setToken(null)
    resetSidebarPreference()
    set({ user: null, token: null })
  },
}))

// 全局 401 监听
if (typeof window !== 'undefined') {
  window.addEventListener('doc-hub:unauthorized', () => {
    const { user, openLogin } = useAuthStore.getState()
    useAuthStore.setState({ user: null, token: null })
    if (user) openLogin('login')
  })
}
