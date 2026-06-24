import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { CheckCircle2, Loader2, Save } from 'lucide-react'
import { Docs, type DocNode } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Props {
  doc: DocNode
  filePath: string
  readOnly?: boolean
  readOnlyReason?: string
  /** 外部触发重拉文件内容（如 WebSocket reload、AI 流式写入） */
  externalReloadKey?: number
  onSavedExternally?: () => void  // 保存成功后触发预览刷新
  onEditorMount?: (editor: {
    getScrollTop: () => number
    getScrollHeight: () => number
    getViewportHeight: () => number
    setScrollTop: (top: number) => void
    onScroll: (handler: () => void) => () => void
  }) => void
}

type Status = 'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error'

function inferLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'html':
    case 'htm': return 'html'
    case 'css': return 'css'
    case 'js':
    case 'mjs': return 'javascript'
    case 'json': return 'json'
    case 'md': return 'markdown'
    case 'svg':
    case 'xml': return 'xml'
    default: return 'plaintext'
  }
}

export function CodeEditor({ doc, filePath, readOnly, readOnlyReason, externalReloadKey, onSavedExternally, onEditorMount }: Props) {
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  // 加载文件（doc/filePath 变化时重新加载）
  useEffect(() => {
    let stopped = false
    setStatus('loading')
    setErrorMsg(null)
    Docs.fileContent(doc.id, filePath)
      .then((r) => {
        if (stopped) return
        setContent(r.content)
        dirtyRef.current = false
        setStatus('saved')
      })
      .catch((e) => {
        if (stopped) return
        setErrorMsg(e?.response?.data?.error ?? '加载失败')
        setStatus('error')
      })
    return () => {
      stopped = true
    }
  }, [doc.id, filePath])

  // 外部变动（如 AI 流式写入、文件夹热更新）触发重读。
  // 仅未 dirty 时覆盖，避免打断用户编辑。AI 流式写入期间 dirtyRef 为 false，会被实时覆盖。
  useEffect(() => {
    if (externalReloadKey === undefined) return
    if (dirtyRef.current) return
    let stopped = false
    Docs.fileContent(doc.id, filePath)
      .then((r) => {
        if (stopped) return
        setContent(r.content)
        setStatus('saved')
      })
      .catch(() => { /* ignore */ })
    return () => {
      stopped = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalReloadKey])

  const save = async () => {
    if (readOnly) return
    if (!dirtyRef.current && status !== 'dirty') return
    setStatus('saving')
    try {
      await Docs.saveFile(doc.id, filePath, content)
      dirtyRef.current = false
      setStatus('saved')
      onSavedExternally?.()
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error ?? e?.message ?? '保存失败')
      setStatus('error')
    }
  }

  // Cmd/Ctrl+S 保存
  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed
    onEditorMount?.({
      getScrollTop: () => ed.getScrollTop(),
      getScrollHeight: () => ed.getScrollHeight(),
      getViewportHeight: () => ed.getDomNode()?.clientHeight ?? 0,
      setScrollTop: (top: number) => ed.setScrollTop(top),
      onScroll: (handler: () => void) => {
        const disposable = ed.onDidScrollChange(handler)
        return () => disposable.dispose()
      },
    })
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current()
    })
  }
  const saveRef = useRef(save)
  saveRef.current = save

  return (
    <div className="flex h-full w-full flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between border-b border-border/40 bg-card/40 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground">{filePath}</span>
          <StatusBadge status={status} error={errorMsg} />
        </div>
        <button
          onClick={save}
          disabled={readOnly || status === 'saving' || status === 'loading'}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors',
            'hover:bg-accent disabled:opacity-50',
          )}
        >
          <Save className="h-3 w-3" /> 保存 <kbd className="ml-1 text-[10px] opacity-60">⌘S</kbd>
        </button>
      </div>
      {readOnly && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
          {readOnlyReason || '当前文档正被其他用户编辑，已切换为只读。'}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          theme="vs-dark"
          language={inferLang(filePath)}
          value={content}
          onChange={(v) => {
            if (readOnly) return
            setContent(v ?? '')
            dirtyRef.current = true
            setStatus('dirty')
          }}
          onMount={handleMount}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            automaticLayout: true,
            readOnly,
            padding: { top: 8 },
            renderLineHighlight: 'gutter',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
          }}
        />
      </div>
    </div>
  )
}

function StatusBadge({ status, error }: { status: Status; error: string | null }) {
  if (status === 'loading') return <Inline icon={<Loader2 className="h-3 w-3 animate-spin" />} text="加载中" />
  if (status === 'saving')  return <Inline icon={<Loader2 className="h-3 w-3 animate-spin" />} text="保存中" />
  if (status === 'saved')   return <Inline icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />} text="已保存" />
  if (status === 'dirty')   return <Inline icon={<span className="h-1.5 w-1.5 rounded-full bg-amber-400" />} text="未保存" />
  if (status === 'error')   return <span className="text-destructive">{error ?? '错误'}</span>
  return null
}
function Inline({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <span className="inline-flex items-center gap-1 text-muted-foreground">{icon}{text}</span>
}
