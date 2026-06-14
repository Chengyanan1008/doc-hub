import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles, Square, Wand2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { AI, aiGenerate, type DocNode } from '@/lib/api'
import { useDocsStore } from '@/store/docs'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** 'create' 时使用 parentId；'edit'/'rewrite' 时使用 doc */
  mode: 'create' | 'edit' | 'rewrite'
  parentId?: string | null
  scope?: 'personal' | 'public'
  doc?: DocNode | null
  onOpenSettings: () => void
}

const SUGGESTIONS_CREATE = [
  '一个产品发布会的精美单页：英雄区 + 特性卡片 + 数据统计 + 时间线 + CTA',
  '一份周报，包含核心指标卡片、本周完成事项时间线、下周计划清单',
  '团队介绍页：成员卡片网格、技能雷达图、联系方式',
  '一份会议纪要：主题、参会人、议题展开折叠、决议高亮、待办清单',
]
const SUGGESTIONS_EDIT = [
  '把整体配色改为暖色调（橙/赭/米白），保持现代风',
  '把标题字号调大，增加段落留白，改善中文阅读体验',
  '把数据卡片改成可点击的，hover 时有微动画',
  '增加一个深色/浅色模式切换按钮',
]

export function AIGenerateDialog({
  open, onOpenChange, mode, parentId, scope = 'personal', doc, onOpenSettings,
}: Props) {
  const { upsertFromServer, selectDoc, loadAll } = useDocsStore()
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [received, setReceived] = useState(0)
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<(() => void) | null>(null)

  const isCreate = mode === 'create'

  useEffect(() => {
    if (open) {
      AI.getSettings().then((r) => setConfigured(r.configured))
      setPrompt(''); setReceived(0); setError(null); setRunning(false)
    } else {
      abortRef.current?.()
    }
  }, [open])

  const start = () => {
    if (!prompt.trim()) return
    setRunning(true); setReceived(0); setError(null)

    abortRef.current = aiGenerate(
      {
        prompt: prompt.trim(),
        mode,
        docId: doc?.id,
        parentId: isCreate ? (parentId ?? null) : undefined,
        scope: isCreate ? scope : undefined,
      },
      {
        onMeta: async (m) => {
          // create 模式：服务端会立刻创建 doc，我们提前选中以便实时预览
          if (isCreate && m.docId) {
            await loadAll()
            selectDoc(m.docId)
          }
        },
        onDelta: (t) => setReceived((n) => n + t.length),
        onDone: async () => {
          setRunning(false)
          await loadAll()
          onOpenChange(false)
        },
        onError: (msg) => {
          setError(msg)
          setRunning(false)
        },
      },
    )
  }

  const stop = () => abortRef.current?.()

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) onOpenChange(v) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-400" />
            {isCreate ? 'AI 生成新文档' : 'AI 改写当前文档'}
          </DialogTitle>
          <DialogDescription>
            {isCreate
              ? '描述你想要的文档或页面，AI 将流式生成并实时预览。'
              : '描述你想要的修改，AI 会基于现有内容重新生成。'}
          </DialogDescription>
        </DialogHeader>

        {!configured && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            ⚠️ 还未配置 AI。
            <button
              className="ml-2 underline text-amber-300"
              onClick={() => { onOpenChange(false); onOpenSettings() }}
            >
              前往设置
            </button>
          </div>
        )}

        <div className="space-y-3">
          <Textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isCreate
              ? '例如：做一份关于 Web 文档站项目的精美产品介绍页…'
              : '例如：把配色改为深色科技风…'}
            disabled={running}
          />
          <div className="flex flex-wrap gap-1.5">
            {(isCreate ? SUGGESTIONS_CREATE : SUGGESTIONS_EDIT).map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                disabled={running}
                className="text-xs rounded-full border border-border/60 px-2.5 py-1 hover:border-primary/60 hover:bg-accent/50 transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {running && (
            <div className="rounded-md border border-violet-500/40 bg-violet-500/10 p-3 text-xs flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
              <span>正在生成… 已接收 {received} 字符（左侧预览会实时刷新）</span>
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              ❌ {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onOpenSettings} disabled={running}>
            <Wand2 /> AI 设置
          </Button>
          <div className="flex-1" />
          {running ? (
            <Button variant="destructive" onClick={stop}>
              <Square /> 停止
            </Button>
          ) : (
            <Button variant="gradient" onClick={start} disabled={!prompt.trim() || !configured}>
              <Sparkles /> {isCreate ? '开始生成' : '开始改写'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
