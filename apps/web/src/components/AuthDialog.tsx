import { useState, useEffect } from 'react'
import { Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AuthDialog() {
  const {
    loginOpen,
    closeLogin,
    loginMode,
    login,
    register,
    loading,
    registerEnabled,
  } = useAuthStore()

  const [tab, setTab] = useState<'login' | 'register'>(loginMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (loginOpen) { setTab(loginMode); setError(null) } }, [loginOpen, loginMode])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      if (tab === 'login') {
        if (!username.trim() || !password) {
          setError('请填写账号和密码'); return
        }
        await login(username.trim(), password)
      } else {
        if (!username.trim() || !password) {
          setError('请填写用户名和密码'); return
        }
        if (password !== confirmPwd) {
          setError('两次输入的密码不一致'); return
        }
        await register({
          username: username.trim(),
          password,
          email: email.trim() || undefined,
          displayName: displayName.trim() || undefined,
        })
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || '操作失败')
    }
  }

  return (
    <Dialog open={loginOpen} onOpenChange={(v) => !v && closeLogin()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                欢迎来到 <span className="text-gradient">Web-Doc</span>
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                登录后即可使用 AI 生成与编辑功能
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setError(null) }}>
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register" disabled={!registerEnabled}>
              注册{!registerEnabled && '（已关闭）'}
            </TabsTrigger>
          </TabsList>

          <form onSubmit={onSubmit} className="space-y-3">
            <TabsContent value="login" className="space-y-3 mt-0">
              <Field label="用户名 / 邮箱">
                <Input
                  autoFocus
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="密码">
                <Input
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </TabsContent>

            <TabsContent value="register" className="space-y-3 mt-0">
              <Field label="用户名" hint="3-32 位字母 / 数字 / 下划线">
                <Input
                  autoFocus
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field label="密码" hint="至少 6 位">
                <Input
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="确认密码">
                <Input
                  type="password"
                  placeholder="••••••"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                />
              </Field>
              <Field label="邮箱（可选）">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="昵称（可选）">
                <Input
                  placeholder="My Name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
            </TabsContent>

            {error && (
              <div className={cn(
                'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive',
              )}>
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" variant="gradient" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {tab === 'login' ? '登录' : '创建账号'}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {tab === 'login' ? (
                registerEnabled ? (
                  <>还没有账号？<button type="button" className="text-primary hover:underline" onClick={() => setTab('register')}>立即注册</button></>
                ) : '注册已关闭，请联系管理员'
              ) : (
                <>已有账号？<button type="button" className="text-primary hover:underline" onClick={() => setTab('login')}>去登录</button></>
              )}
            </p>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-foreground/80">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
