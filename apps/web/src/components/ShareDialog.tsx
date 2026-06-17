import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, Globe2, Link, Link2, Lock, ShieldOff } from 'lucide-react'
import { Nodes, Shares, type DocNode } from '@/lib/api'
import { copyToClipboard } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type AccessMode = 'off' | 'link' | 'public'

const accessCopy: Record<AccessMode, { label: string; hint: string; urlLabel: string; detail: string }> = {
  off: {
    label: '未开启',
    hint: '未登录用户不能查看；已有分享链接会被撤销。',
    urlLabel: '未开启',
    detail: '只有登录后的文档所有者可以查看。',
  },
  link: {
    label: '获得链接的人',
    hint: '生成一条带随机 token 的分享链接，拿到链接的人可查看。',
    urlLabel: '分享链接',
    detail: '链接形如 /s/随机token。撤销后，这条分享链接立即且永久失效。',
  },
  public: {
    label: '互联网公开',
    hint: '文档原地址公开，任何知道地址的人都可以查看。',
    urlLabel: '公开地址',
    detail: '链接形如 /v/文档ID。不依赖随机 token，撤销后不可查看文档，打开分享可再次查看文档内容，适合放到官网、群公告或外网长期传播。',
  },
}

export function ShareDialog({
  doc, open, onOpenChange,
}: {
  doc: DocNode | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [mode, setMode] = useState<AccessMode>('off')
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !doc) return
    setMode(doc.visibility === 'public' ? 'public' : 'off')
    setToken(null)
    setCopied(false)
    setSaving(false)
  }, [open, doc])

  const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  const shareUrl = token ? `${location.origin}${baseUrl}/s/${token}` : ''
  const publicUrl = doc ? `${location.origin}${baseUrl}/v/${doc.id}` : ''

  const activeUrl = useMemo(() => {
    if (mode === 'link') return shareUrl
    if (mode === 'public') return publicUrl
    return ''
  }, [mode, publicUrl, shareUrl])

  const setAccess = async (next: AccessMode) => {
    if (!doc || next === mode) return
    setSaving(true)
    try {
      if (next === 'off') {
        await Shares.revoke(doc.id)
        await Nodes.update(doc.id, { visibility: 'private' })
        setToken(null)
      } else if (next === 'link') {
        const s = await Shares.create(doc.id)
        await Nodes.update(doc.id, { visibility: 'private' })
        setToken(s.token)
      } else {
        await Shares.revoke(doc.id)
        await Nodes.update(doc.id, { visibility: 'public' })
        setToken(null)
      }
      setMode(next)
      setCopied(false)
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    if (!activeUrl) return
    const ok = await copyToClipboard(activeUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } else {
      window.prompt('复制失败，请手动按 Ctrl/Cmd+C 复制：', activeUrl)
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
            设置未登录访问权限，并复制对应链接。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium">链接分享</div>
                <div className="text-xs text-muted-foreground">{accessCopy[mode].hint}</div>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={saving} className="min-w-36 justify-between">
                  {accessCopy[mode].label}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setAccess('off')}>
                  <ShieldOff className="h-4 w-4" />
                  未开启
                  {mode === 'off' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAccess('link')}>
                  <Lock className="h-4 w-4" />
                  获得链接的人
                  {mode === 'link' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAccess('public')}>
                  <Globe2 className="h-4 w-4" />
                  互联网公开
                  {mode === 'public' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={activeUrl}
              readOnly
              placeholder={mode === 'off' ? '未开启未登录访问' : '生成中...'}
              className="font-mono text-xs"
            />
            <Button onClick={copy} disabled={!activeUrl || saving} variant={copied ? 'default' : 'gradient'}>
              {copied ? <><Check /> 已复制</> : <><Copy /> 复制</>}
            </Button>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">当前链接类型</span>
              <span className="rounded bg-background px-2 py-0.5 text-xs text-foreground">
                {accessCopy[mode].urlLabel}
              </span>
            </div>
            <div className="text-xs leading-relaxed text-muted-foreground">
              {accessCopy[mode].detail}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
