import { useEffect, useState } from 'react'
import { FileText, Info } from 'lucide-react'
import { Nodes, type DocNode, type NodeInfo } from '@/lib/api'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'

export function NodeInfoDialog({
  node, open, onOpenChange,
}: {
  node: DocNode | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [info, setInfo] = useState<NodeInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !node) return
    setInfo(null)
    setError(null)
    Nodes.info(node.id)
      .then(setInfo)
      .catch((e) => setError(e?.response?.data?.error ?? e?.message ?? '加载失败'))
  }, [open, node])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            文件信息
          </DialogTitle>
          <DialogDescription>{node?.title}</DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : !info ? (
          <div className="text-sm text-muted-foreground">加载中...</div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
              <FileText className="h-5 w-5 text-violet-400" />
              <div className="min-w-0">
                <div className="truncate font-medium">{info.title}</div>
                <div className="text-xs text-muted-foreground">
                  {info.type === 'folder' ? '文件夹' : '文档'} · {info.scope === 'public' ? '公共' : '个人'} · {formatBytes(info.sizeBytes)}
                </div>
              </div>
            </div>
            <InfoRow label="创建人" value={info.createdBy?.name || '未知用户'} />
            <InfoRow label="创建时间" value={formatDateTime(info.createdAt)} />
            <InfoRow label="最后修改人" value={info.updatedBy?.name || '未知用户'} />
            <InfoRow label="最后修改时间" value={formatDateTime(info.updatedAt)} />
            {info.type === 'doc' && <InfoRow label="入口文件" value={info.entryFile || 'index.html'} />}
            <InfoRow label="访问范围" value={info.visibility === 'public' ? '互联网公开' : '未公开'} />
            <InfoRow
              label="编辑状态"
              value={info.currentLock?.locked ? `${info.currentLock.owner?.name || '其他用户'} 正在编辑` : '无人编辑'}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 border-b border-border/40 pb-2 last:border-b-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-foreground">{value}</div>
    </div>
  )
}

function formatDateTime(raw: string) {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}
