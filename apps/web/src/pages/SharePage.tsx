import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Shares, docAssetUrl, type DocNode } from '@/lib/api'
import { renderMarkdown } from '@/components/MarkdownPreview'

function isMarkdownFile(path: string): boolean {
  return /\.md$/i.test(path)
}

function SharedMarkdown({
  doc,
  token,
  filePath,
}: {
  doc: DocNode
  token: string
  filePath: string
}) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    setError(null)
    setContent('')

    fetch(docAssetUrl(doc.id, filePath, { share: token }), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Markdown 加载失败')
        return res.text()
      })
      .then((text) => {
        if (!stopped) setContent(text)
      })
      .catch((e) => {
        if (!stopped) setError(e?.message ?? 'Markdown 加载失败')
      })

    return () => { stopped = true }
  }, [doc.id, filePath, token])

  const html = useMemo(
    () => renderMarkdown(doc.id, filePath, content, { share: token }),
    [content, doc.id, filePath, token],
  )

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white px-6 text-sm text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-auto bg-white text-slate-900">
      <article
        className="mx-auto max-w-4xl px-8 py-10 leading-7
          [&_h1]:mb-5 [&_h1]:mt-0 [&_h1]:border-b [&_h1]:border-slate-200 [&_h1]:pb-3 [&_h1]:text-3xl [&_h1]:font-semibold
          [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-b [&_h2]:border-slate-200 [&_h2]:pb-2 [&_h2]:text-2xl [&_h2]:font-semibold
          [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold
          [&_p]:my-4 [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2
          [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-7 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-7 [&_li]:my-1
          [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:bg-slate-50 [&_blockquote]:px-4 [&_blockquote]:py-1 [&_blockquote]:text-slate-600
          [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm
          [&_pre]:relative [&_pre]:my-4 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-slate-950 [&_pre]:p-4 [&_pre]:pt-8 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100
          [&_.md-code-label]:absolute [&_.md-code-label]:right-3 [&_.md-code-label]:top-2 [&_.md-code-label]:rounded [&_.md-code-label]:bg-white/10 [&_.md-code-label]:px-2 [&_.md-code-label]:py-0.5 [&_.md-code-label]:text-[11px] [&_.md-code-label]:uppercase [&_.md-code-label]:tracking-wide [&_.md-code-label]:text-slate-400
          [&_.hljs-keyword]:text-sky-300 [&_.hljs-built_in]:text-cyan-400 [&_.hljs-type]:text-cyan-400 [&_.hljs-title]:text-yellow-200
          [&_.hljs-string]:text-red-400 [&_.hljs-number]:text-amber-300 [&_.hljs-literal]:text-amber-300 [&_.hljs-comment]:text-green-500
          [&_.hljs-attr]:text-violet-300 [&_.hljs-attribute]:text-violet-300 [&_.hljs-variable]:text-slate-100 [&_.hljs-params]:text-slate-100
          [&_.hljs-section]:text-yellow-200 [&_.hljs-selector-tag]:text-sky-300 [&_.hljs-selector-class]:text-yellow-200 [&_.hljs-name]:text-sky-300
          [&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left
          [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_img]:my-5 [&_img]:max-w-full [&_hr]:my-8 [&_hr]:border-slate-200"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

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

  const filePath = doc?.entryFile || 'index.html'
  const markdownShare = !!doc && !!token && isMarkdownFile(filePath)
  const src = useMemo(() => {
    if (!doc || !token || markdownShare) return ''
    return docAssetUrl(doc.id, filePath, { share: token })
  }, [doc, filePath, markdownShare, token])

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

  if (!doc || !token) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
        加载中...
      </div>
    )
  }

  if (markdownShare) {
    return <SharedMarkdown doc={doc} token={token} filePath={filePath} />
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
