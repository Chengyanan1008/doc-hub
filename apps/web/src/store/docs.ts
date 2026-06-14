import { create } from 'zustand'
import type { DocNode, ReorderItem } from '@/lib/api'
import { Nodes, NodesReorder } from '@/lib/api'

const SIDEBAR_KEY = 'doc-hub.sidebarOpen'

function initialSidebarOpen() {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(SIDEBAR_KEY)
  if (raw == null) return true
  return raw !== 'false'
}

export function resetSidebarPreference() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SIDEBAR_KEY)
  }
  useDocsStore.setState({ sidebarOpen: true })
}

interface DocsState {
  nodes: DocNode[]
  loading: boolean
  selectedId: string | null
  sharedDocIds: string[]
  sidebarOpen: boolean

  loadAll: () => Promise<void>
  selectDoc: (id: string | null) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  createNode: (payload: { parentId?: string | null; scope?: 'personal' | 'public'; type: 'folder' | 'doc'; title: string; html?: string }) => Promise<DocNode>
  updateNode: (id: string, patch: Parameters<typeof Nodes.update>[1]) => Promise<void>
  removeNode: (id: string) => Promise<void>
  reorderNodes: (items: ReorderItem[]) => Promise<void>
  upsertFromServer: (n: DocNode, options?: { select?: boolean; shared?: boolean }) => void
}

export const useDocsStore = create<DocsState>((set, get) => ({
  nodes: [],
  loading: false,
  selectedId: null,
  sharedDocIds: [],
  sidebarOpen: initialSidebarOpen(),

  loadAll: async () => {
    set({ loading: true })
    try {
      const items = await Nodes.list()
      const existing = get().nodes
      const sharedDocIds = new Set(get().sharedDocIds)
      const itemIds = new Set(items.map((n) => n.id))
      const sharedDocs = existing.filter((n) => sharedDocIds.has(n.id) && !itemIds.has(n.id))
      set({ nodes: [...items, ...sharedDocs] })
    } finally {
      set({ loading: false })
    }
  },

  selectDoc: (id) => set({ selectedId: id }),
  toggleSidebar: () => {
    const open = !get().sidebarOpen
    if (typeof window !== 'undefined') localStorage.setItem(SIDEBAR_KEY, String(open))
    set({ sidebarOpen: open })
  },
  setSidebarOpen: (open) => {
    if (typeof window !== 'undefined') localStorage.setItem(SIDEBAR_KEY, String(open))
    set({ sidebarOpen: open })
  },

  createNode: async (payload) => {
    const node = await Nodes.create(payload)
    set({ nodes: [...get().nodes, node] })
    if (node.type === 'doc') set({ selectedId: node.id })
    return node
  },

  updateNode: async (id, patch) => {
    const node = await Nodes.update(id, patch)
    set({ nodes: get().nodes.map((n) => (n.id === id ? node : n)) })
  },

  removeNode: async (id) => {
    await Nodes.remove(id)
    // 同步移除子树
    const idsToRemove = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const n of get().nodes) {
        if (n.parentId && idsToRemove.has(n.parentId) && !idsToRemove.has(n.id)) {
          idsToRemove.add(n.id)
          changed = true
        }
      }
    }
    set({
      nodes: get().nodes.filter((n) => !idsToRemove.has(n.id)),
      selectedId: idsToRemove.has(get().selectedId ?? '') ? null : get().selectedId,
    })
  },

  reorderNodes: async (items) => {
    // 乐观更新
    const map = new Map(items.map((i) => [i.id, i]))
    const nodes = get().nodes
    const changedFolderScopes = nodes
      .filter((n) => n.type === 'folder')
      .map((n) => ({ node: n, item: map.get(n.id) }))
      .filter(({ node, item }) => item?.scope && item.scope !== node.scope)
      .map(({ node, item }) => ({ folderId: node.id, scope: item!.scope! }))

    const isDescendantOf = (node: DocNode, folderId: string) => {
      let parentId = node.parentId
      for (let i = 0; i < 100 && parentId; i++) {
        if (parentId === folderId) return true
        parentId = nodes.find((n) => n.id === parentId)?.parentId
      }
      return false
    }

    set({
      nodes: nodes.map((n) => {
        const it = map.get(n.id)
        const inheritedScope = changedFolderScopes.find((c) => isDescendantOf(n, c.folderId))?.scope
        if (!it) return inheritedScope ? { ...n, scope: inheritedScope } : n
        return {
          ...n,
          parentId: it.parentId ?? null,
          scope: it.scope ?? inheritedScope ?? n.scope,
          sortOrder: it.sortOrder,
        }
      }),
    })
    try {
      await NodesReorder.batch(items)
    } catch (e) {
      // 失败时回滚（重新拉一遍）
      const fresh = await Nodes.list()
      set({ nodes: fresh })
      throw e
    }
  },

  upsertFromServer: (n, options) => {
    const arr = get().nodes
    const i = arr.findIndex((x) => x.id === n.id)
    const patch: Partial<DocsState> = {}
    if (i >= 0) {
      const next = arr.slice()
      next[i] = n
      patch.nodes = next
    } else {
      patch.nodes = [...arr, n]
    }
    if (options?.shared) {
      patch.sharedDocIds = Array.from(new Set([...get().sharedDocIds, n.id]))
    }
    if (options?.select) {
      patch.selectedId = n.id
    }
    set(patch)
  },
}))
