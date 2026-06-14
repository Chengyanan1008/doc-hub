import { useEffect, useState } from 'react'
import { AlertCircle, Loader2, Plus, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react'
import { AdminUsers, type AuthUser } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function UserManagementDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await AdminUsers.list())
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || '加载用户失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const resetForm = () => {
    setUsername('')
    setPassword('')
    setEmail('')
    setDisplayName('')
    setRole('user')
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const user = await AdminUsers.create({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        displayName: displayName.trim() || undefined,
        role,
      })
      setUsers((prev) => [...prev, user])
      resetForm()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || '创建用户失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-violet-400" />
            用户管理
          </DialogTitle>
          <DialogDescription>
            管理员可以在这里创建用户；关闭公开注册后，普通用户仍可由管理员创建。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_1.15fr]">
          <form onSubmit={createUser} className="space-y-3 rounded-lg border border-border/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4" />
              创建用户
            </div>
            <Field label="用户名" hint="3-32 位字母 / 数字 / 下划线">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
            </Field>
            <Field label="初始密码" hint="至少 6 位">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
            </Field>
            <Field label="邮箱（可选）">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
            </Field>
            <Field label="昵称（可选）">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="姓名或昵称" />
            </Field>
            <Field label="角色">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </Field>
            <Button type="submit" variant="gradient" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              创建用户
            </Button>
          </form>

          <div className="min-h-[320px] rounded-lg border border-border/60">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div className="text-sm font-medium">已有用户</div>
              <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={loading ? 'animate-spin' : ''} />
                刷新
              </Button>
            </div>
            {error && (
              <div className="m-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="max-h-[360px] overflow-y-auto p-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{u.displayName || u.username}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.username}{u.email ? ` · ${u.email}` : ''}
                    </div>
                  </div>
                  <span className="ml-3 shrink-0 rounded border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {u.role === 'admin' ? '管理员' : '普通用户'}
                  </span>
                </div>
              ))}
              {!loading && users.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">暂无用户</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/80">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
