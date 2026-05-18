import { useEffect, useState } from 'react'
import { Check, Copy, Link } from 'lucide-react'
import { Shares, type DocNode } from '@/lib/api'
import { copyToClipboard } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ShareDialog({
  doc, open, onOpenChange,
}: {
  doc: DocNode | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && doc) {
      Shares.create(doc.id).then((s) => setToken(s.token))
    } else {
      setToken(null); setCopied(false)
    }
  }, [open, doc])

  // 默认分享链接：/s/:token 打开后会自动跳转到 /v/:docId（带完整主站外壳）。
  // 访问者如需隐藏主站顶部和左侧菜单，可使用 ?fullscreen 链接（仍然是 React 外壳 + iframe，仅视觉隐藏菜单）。
  // 注意：必须拼上 Vite 构建时的 BASE_URL（如 /doc/），否则在反向代理（nginx 暴露 /doc/）下链接会 404。
  const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  const url = token ? `${location.origin}${baseUrl}/s/${token}` : ''
  const fullscreenUrl = token ? `${location.origin}${baseUrl}/s/${token}?fullscreen=1` : ''

  const copy = async (target: string) => {
    if (!target) return
    const ok = await copyToClipboard(target)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } else {
      // 兜底：复制失败时提示用户手动选中复制（多见于非 HTTPS 站点 + 浏览器禁用了 execCommand）
      window.prompt('复制失败，请手动按 Ctrl/Cmd+C 复制：', target)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-primary" />
            分享 "{doc?.title}"
          </DialogTitle>
          <DialogDescription>
            通过链接分享这个文档，访问者无需登录即可查看。
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 pt-2">
          <Input value={url} readOnly placeholder="生成中…" className="font-mono text-xs" />
          <Button onClick={() => copy(url)} disabled={!url} variant={copied ? 'default' : 'gradient'}>
            {copied ? <><Check /> 已复制</> : <><Copy /> 复制</>}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          默认链接：访问者会看到完整的文档站（顶部＋左侧菜单）。
        </p>
        <div className="flex items-center gap-2 pt-2">
          <Input value={fullscreenUrl} readOnly placeholder="生成中…" className="font-mono text-xs" />
          <Button onClick={() => copy(fullscreenUrl)} disabled={!fullscreenUrl} variant="outline">
            <Copy /> 复制
          </Button>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          全屏链接（?fullscreen）：隐藏主站顶部和左侧菜单，只展示文档内容（仍保留 iframe 隔离）。
        </p>
      </DialogContent>
    </Dialog>
  )
}
