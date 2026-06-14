import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Shares, docAssetUrl, type DocNode } from '@/lib/api'

export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [doc, setDoc] = useState<DocNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    setError(null)
    Shares.info(token)
      .then((r) => setDoc(r.doc))
      .catch(() => setError('链接无效或已过期'))
  }, [token])

  const src = useMemo(() => {
    if (!doc || !token) return ''
    return docAssetUrl(doc.id, doc.entryFile || 'index.html', { share: token })
  }, [doc, token])

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="rounded-lg border border-border px-8 py-6 text-center">
          <h1 className="text-lg font-semibold mb-2">{error}</h1>
          <p className="text-sm text-muted-foreground">请联系分享者获取新链接。</p>
        </div>
      </div>
    )
  }

  if (!src) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
        加载中...
      </div>
    )
  }

  return (
    <iframe
      src={src}
      className="h-full w-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
      referrerPolicy="no-referrer"
      title={doc?.title ?? 'Doc-Hub Share'}
    />
  )
}
