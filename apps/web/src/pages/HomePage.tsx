import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FilePlus2, PanelLeftClose, PanelLeftOpen, Sparkles, Wand2 } from 'lucide-react'
import { useDocsStore } from '@/store/docs'
import { useAIChatStore } from '@/store/aiChat'
import { useAuthStore } from '@/store/auth'
import { getToken, PublicDocs, type DocNode } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DocTree } from '@/components/DocTree'
import { DocViewer } from '@/components/DocViewer'
import { CreateDocDialog } from '@/components/CreateDocDialog'
import { ShareDialog } from '@/components/ShareDialog'
import { AISettingsDialog } from '@/components/AISettingsDialog'
import { AuthDialog } from '@/components/AuthDialog'
import { UserMenu } from '@/components/UserMenu'
import { UserManagementDialog } from '@/components/UserManagementDialog'

export default function HomePage() {
  const { nodes, loadAll, selectedId, sidebarOpen, toggleSidebar, selectDoc, createNode } = useDocsStore()
  const { openPanel } = useAIChatStore()
  const { user, bootstrap, openLogin } = useAuthStore()
  const [createOpen, setCreateOpen] = useState(false)
  const [createParent, setCreateParent] = useState<string | null>(null)
  const [createScope, setCreateScope] = useState<'personal' | 'public'>('personal')
  const [shareDoc, setShareDoc] = useState<DocNode | null>(null)
  const [aiSettingsOpen, setAISettingsOpen] = useState(false)
  const [userManagementOpen, setUserManagementOpen] = useState(false)
  const [publicDoc, setPublicDoc] = useState<DocNode | null>(null)
  const [publicDenied, setPublicDenied] = useState(false)

  const { docId: routeDocId } = useParams<{ docId?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fullscreen = searchParams.get('fullscreen') !== null
    && searchParams.get('fullscreen') !== '0'
    && searchParams.get('fullscreen') !== 'false'

  useEffect(() => {
    if (user) loadAll()
  }, [loadAll, user])
  useEffect(() => { bootstrap() }, [bootstrap])
  useEffect(() => {
    if (user || getToken() || !routeDocId) {
      setPublicDoc(null)
      setPublicDenied(false)
      return
    }
    setPublicDoc(null)
    setPublicDenied(false)
    PublicDocs.get(routeDocId)
      .then((r) => setPublicDoc(r.node))
      .catch(() => setPublicDenied(true))
  }, [routeDocId, user])

  // URL → store
  useEffect(() => {
    console.debug('[doc-hub route] URL -> store', {
      pathname: location.pathname,
      search: location.search,
      routeDocId,
      selectedId,
    })
    if (routeDocId && routeDocId !== selectedId) {
      console.debug('[doc-hub route] select doc from URL', { routeDocId, selectedId })
      selectDoc(routeDocId)
    }
    if (!routeDocId && selectedId) {
      console.debug('[doc-hub route] clear selected doc because URL has no doc id', { selectedId })
      selectDoc(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDocId])

  // store → URL（保持 query 参数，例如 fullscreen）
  useEffect(() => {
    if (routeDocId && !selectedId) {
      console.debug('[doc-hub route] skip store -> URL while URL doc is being synced to store', {
        routeDocId,
        selectedId,
        pathname: location.pathname,
        search: location.search,
      })
      return
    }

    const search = location.search || ''
    const target = (selectedId ? `/v/${selectedId}` : '/') + search
    const current = (routeDocId ? `/v/${routeDocId}` : '/') + search
    if (target !== current) {
      console.debug('[doc-hub route] store -> URL navigate', {
        selectedId,
        routeDocId,
        current,
        target,
      })
      navigate(target, { replace: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const selectedDoc = useMemo<DocNode | null>(
    () => nodes.find((n) => n.id === selectedId && n.type === 'doc') ?? publicDoc,
    [nodes, publicDoc, selectedId],
  )

  if (!user && !getToken() && routeDocId) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-background">
        {publicDoc ? (
          <DocViewer
            doc={publicDoc}
            onShare={() => {}}
            onOpenAISettings={() => {}}
            chromeless
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <div>{publicDenied ? '这个文档不是公开文档，请登录后查看。' : '加载中...'}</div>
            {publicDenied && <Button onClick={() => openLogin('login')}>登录</Button>}
            <AuthDialog />
          </div>
        )}
      </div>
    )
  }

  // URL 指向不存在文档：清空（仅登录用户、非 fullscreen 模式才校验，
  // 避免分享访客/未登录用户因本地 nodes 列表不包含被分享文档而被误重定向回首页）。
  useEffect(() => {
    if (!routeDocId || nodes.length === 0) return
    if (!user) {
      console.debug('[doc-hub route] skip missing-doc validation for anonymous visitor', {
        routeDocId,
        nodesCount: nodes.length,
        fullscreen,
      })
      return
    }
    if (fullscreen) {
      console.debug('[doc-hub route] skip missing-doc validation in fullscreen mode', {
        routeDocId,
        nodesCount: nodes.length,
        userId: user.id,
        username: user.username,
      })
      return
    }
    const exists = nodes.some((n) => n.id === routeDocId && n.type === 'doc')
    console.debug('[doc-hub route] validate route doc against node list', {
      routeDocId,
      exists,
      nodesCount: nodes.length,
      userId: user.id,
      username: user.username,
      visibleDocIds: nodes.filter((n) => n.type === 'doc').map((n) => n.id),
    })
    if (!exists) {
      console.warn('[doc-hub route] route doc is missing from current node list, navigate to home', {
        routeDocId,
        nodesCount: nodes.length,
        userId: user.id,
        username: user.username,
      })
      selectDoc(null)
      navigate('/', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, routeDocId, user])

  const handleCreate = (parentId: string | null, scope: 'personal' | 'public' = 'personal') => {
    if (!user) {
      openLogin('login')
      return
    }
    setCreateParent(parentId)
    setCreateScope(scope)
    setCreateOpen(true)
  }

  // 入口："AI 生成"：创建一个占位空文档，进入文档详情并自动打开 AI 面板
  const handleStartAI = async (parentId: string | null, scope: 'personal' | 'public' = 'personal') => {
    if (!user) {
      openLogin('login')
      return
    }
    const node = await createNode({
      parentId,
      scope,
      type: 'doc',
      title: 'AI 新文档',
    })
    selectDoc(node.id)
    openPanel()
  }

  const handleGoHome = () => {
    selectDoc(null)
    navigate('/', { replace: false })
  }

  // ========== Fullscreen 模式：仅显示文档纯净预览（无外壳） ==========
  if (fullscreen) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-background">
        {selectedDoc ? (
          <DocViewer
            doc={selectedDoc}
            onShare={setShareDoc}
            onOpenAISettings={() => setAISettingsOpen(true)}
            chromeless
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
            加载中…
          </div>
        )}
        <ShareDialog doc={shareDoc} open={!!shareDoc} onOpenChange={(v) => !v && setShareDoc(null)} />
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-background flex">
      {/* 侧栏：通过 sidebarOpen 控制显隐 */}
      {user && sidebarOpen && (
        <aside className="h-full w-72 shrink-0 bg-card border-r border-border/60 shadow-xl flex flex-col">
          <SidebarHeader
            onToggle={toggleSidebar}
            onNew={() => handleCreate(null)}
            onAISettings={() => { if (!user) { openLogin('login'); return } setAISettingsOpen(true) }}
          />
          <div className="flex-1 overflow-y-auto py-2">
            <DocTree onCreateInFolder={handleCreate} />
          </div>
          <SidebarFooter
            count={nodes.filter((n) => n.type === 'doc').length}
            onUserManagement={() => setUserManagementOpen(true)}
          />
        </aside>
      )}

      {/* 主预览区域 */}
      <main className="relative flex-1 min-w-0 h-full">
        {selectedDoc ? (
          <DocViewer
            doc={selectedDoc}
            onShare={setShareDoc}
            onOpenAISettings={() => setAISettingsOpen(true)}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={user ? toggleSidebar : undefined}
            onHome={handleGoHome}
          />
        ) : (
          <EmptyState
            sidebarOpen={sidebarOpen}
            onToggleSidebar={user ? toggleSidebar : undefined}
            onCreate={() => handleCreate(null)}
            onAI={() => handleStartAI(null)}
          />
        )}
      </main>

      {/* 弹窗 */}
      <CreateDocDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={createParent}
        scope={createScope}
        onAITrigger={(pid, scope) => { setCreateOpen(false); setTimeout(() => handleStartAI(pid, scope), 150) }}
      />
      <ShareDialog doc={shareDoc} open={!!shareDoc} onOpenChange={(v) => !v && setShareDoc(null)} />
      <AISettingsDialog open={aiSettingsOpen} onOpenChange={setAISettingsOpen} />
      <UserManagementDialog open={userManagementOpen} onOpenChange={setUserManagementOpen} />
      <AuthDialog />
    </div>
  )
}

function SidebarHeader({
  onToggle, onNew, onAISettings,
}: {
  onToggle: () => void
  onNew: () => void
  onAISettings: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 border-b border-border/60">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-md">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gradient leading-none">Doc-Hub</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">文档管理平台</div>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAISettings}>
            <Wand2 className="text-violet-400" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>AI 设置</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNew}>
            <FilePlus2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>新建</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
            <PanelLeftClose />
          </Button>
        </TooltipTrigger>
        <TooltipContent>关闭侧栏</TooltipContent>
      </Tooltip>
    </div>
  )
}

function SidebarFooter({ count, onUserManagement }: { count: number; onUserManagement: () => void }) {
  return (
    <div className="px-3 py-2 border-t border-border/60 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
      <UserMenu onUserManagement={onUserManagement} />
      <span className="truncate">共 {count} 个文档</span>
    </div>
  )
}

function EmptyState({
  sidebarOpen, onToggleSidebar, onCreate, onAI,
}: {
  sidebarOpen: boolean
  onToggleSidebar?: () => void
  onCreate: () => void
  onAI: () => void
}) {
  return (
    <div className="relative h-full w-full flex items-center justify-center gradient-bg">
      <div className="absolute right-4 top-4 z-10">
        <UserMenu />
      </div>
      {/* 顶部仅在侧栏关闭时显示打开按钮 */}
      {!sidebarOpen && onToggleSidebar && (
        <div className="absolute left-0 top-0 z-10 px-3 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleSidebar}>
                <PanelLeftOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent>打开侧栏</TooltipContent>
          </Tooltip>
        </div>
      )}
      <div className="text-center max-w-md px-8">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-xl shadow-violet-500/30 mb-6">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          欢迎使用 <span className="text-gradient">Doc-Hub</span>
        </h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          集中管理内部文档、页面和多文件项目。<br />
          沙箱预览、权限分享、公共与个人目录。
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="gradient" size="lg" onClick={onAI}>
            <Sparkles /> AI 生成文档
          </Button>
          <Button variant="outline" size="lg" onClick={onCreate}>
            <FilePlus2 /> 手动创建
          </Button>
        </div>
      </div>
    </div>
  )
}
