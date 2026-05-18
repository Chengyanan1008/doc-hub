import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import HomePage from '@/pages/HomePage'
import SharePage from '@/pages/SharePage'

// 与 Vite 构建时的 base 保持一致，使路由识别 `/doc/...` 这类带前缀的 URL。
const ROUTER_BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/'

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <BrowserRouter basename={ROUTER_BASENAME}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/v/:docId" element={<HomePage />} />
          <Route path="/s/:token" element={<SharePage />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
