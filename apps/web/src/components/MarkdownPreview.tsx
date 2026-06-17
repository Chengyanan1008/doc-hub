import { useEffect, useMemo, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import { marked } from 'marked'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { Docs, docAssetUrl, type DocNode } from '@/lib/api'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)

function isSafeUrl(url: string): boolean {
  const value = url.trim().toLowerCase()
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('mailto:') ||
    value.startsWith('#') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('/')
  )
}

function resolveMarkdownAsset(
  docId: string,
  markdownPath: string,
  raw: string,
  params?: Record<string, string | number | undefined>,
): string {
  if (!raw || !isSafeUrl(raw)) return '#'
  if (/^(https?:|mailto:|#|\/)/i.test(raw)) return raw
  const baseDir = markdownPath.includes('/') ? markdownPath.slice(0, markdownPath.lastIndexOf('/') + 1) : ''
  return docAssetUrl(docId, `${baseDir}${raw}`, params)
}

function escapeHTML(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function highlightCode(raw: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value
  }
  try {
    return hljs.highlightAuto(raw).value
  } catch {
    return escapeHTML(raw)
  }
}

function sanitizeRenderedHTML(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('script, iframe, object, embed, form, input, button, textarea, select, style, link').forEach((el) => el.remove())
  template.content.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value
      if (name.startsWith('on') || name === 'srcdoc') {
        el.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && !isSafeUrl(value)) {
        el.removeAttribute(attr.name)
      }
    }
  })

  return template.innerHTML
}

export function renderMarkdown(
  docId: string,
  filePath: string,
  content: string,
  params?: Record<string, string | number | undefined>,
): string {
  const renderer = new marked.Renderer()
  const defaultLink = renderer.link.bind(renderer)
  const defaultImage = renderer.image.bind(renderer)

  renderer.link = ({ href, title, tokens }) => {
    const safeHref = resolveMarkdownAsset(docId, filePath, href || '', params)
    const label = marked.parser([{ type: 'paragraph', raw: '', text: '', tokens }] as any).replace(/^<p>|<\/p>\n?$/g, '')
    const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
    return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noreferrer">${label}</a>`
  }
  renderer.image = ({ href, title, text }) => {
    if (!href) return defaultImage({ href, title, text } as any)
    const safeHref = resolveMarkdownAsset(docId, filePath, href, params)
    const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
    return `<img src="${safeHref}" alt="${(text || '').replace(/"/g, '&quot;')}"${titleAttr} />`
  }
  renderer.code = ({ text, lang }) => {
    const normalizedLang = (lang || '').trim().split(/\s+/)[0].toLowerCase()
    const highlighted = highlightCode(text || '', normalizedLang)
    const className = normalizedLang ? ` class="language-${normalizedLang}"` : ''
    const label = normalizedLang ? `<div class="md-code-label">${escapeHTML(normalizedLang)}</div>` : ''
    return `<pre>${label}<code${className}>${highlighted}</code></pre>`
  }

  const html = marked.parse(content, {
    async: false,
    breaks: false,
    gfm: true,
    renderer,
  }) as string
  return sanitizeRenderedHTML(html)
}

export function MarkdownPreview({
  doc,
  filePath,
  reloadKey,
}: {
  doc: DocNode
  filePath: string
  reloadKey: number
}) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    setError(null)
    Docs.fileContent(doc.id, filePath)
      .then((r) => {
        if (!stopped) setContent(r.content)
      })
      .catch((e) => {
        if (!stopped) setError(e?.response?.data?.error ?? e?.message ?? 'Markdown 加载失败')
      })
    return () => { stopped = true }
  }, [doc.id, filePath, reloadKey])

  const html = useMemo(() => renderMarkdown(doc.id, filePath, content), [content, doc.id, filePath])

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white px-6 text-sm text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-white text-slate-900">
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
