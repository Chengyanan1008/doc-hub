import { useMemo, useState } from 'react'
import {
  ChevronRight, FileCode, FolderClosed, FolderOpen,
  GripVertical, MoreHorizontal, Pencil, Plus, Trash2,
} from 'lucide-react'
import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor,
  pointerWithin, rectIntersection, useDroppable, useSensor, useSensors,
  type CollisionDetection,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { DocNode } from '@/lib/api'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useDocsStore } from '@/store/docs'

interface TreeItem extends DocNode {
  children: TreeItem[]
}

function buildTree(nodes: DocNode[]): TreeItem[] {
  const map = new Map<string, TreeItem>()
  nodes.forEach((n) => map.set(n.id, { ...n, children: [] }))
  const roots: TreeItem[] = []
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n)
    } else {
      roots.push(n)
    }
  }
  const sortFn = (a: TreeItem, b: TreeItem) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.title.localeCompare(b.title, 'zh-CN')
  }
  const walk = (list: TreeItem[]) => {
    list.sort(sortFn)
    list.forEach((c) => walk(c.children))
  }
  walk(roots)
  return roots
}

interface FlatRow {
  node: TreeItem
  depth: number
}
function flatten(tree: TreeItem[], expanded: Set<string>): FlatRow[] {
  const out: FlatRow[] = []
  const walk = (list: TreeItem[], depth: number) => {
    for (const n of list) {
      out.push({ node: n, depth })
      if (n.type === 'folder' && expanded.has(n.id)) {
        walk(n.children, depth + 1)
      }
    }
  }
  walk(tree, 0)
  return out
}

export function DocTree({
  onCreateInFolder,
}: {
  onCreateInFolder?: (parentId: string | null) => void
}) {
  const { nodes, selectedId, selectDoc, updateNode, removeNode, createNode, reorderNodes } = useDocsStore()
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(nodes.filter((n) => n.type === 'folder').map((n) => n.id)))
  const [activeId, setActiveId] = useState<string | null>(null)

  const flat = useMemo(() => flatten(tree, expanded), [tree, expanded])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // 自定义碰撞检测：优先「拖到文件夹」（folder-drop:*），避免被 sortable 同级插入抢占。
  // 只有当指针不在任何文件夹上时，才使用默认 rectIntersection 进行同级排序。
  const collisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args)
    const folderHit = pointerHits.find((c) => String(c.id).startsWith('folder-drop:'))
    if (folderHit) return [folderHit]
    const rootHit = pointerHits.find((c) => String(c.id) === 'root-drop')
    if (rootHit) return [rootHit]
    return rectIntersection(args)
  }

  const toggle = (id: string) => {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const draggedId = String(active.id)
    const dragged = nodes.find((n) => n.id === draggedId)
    if (!dragged) return

    let targetParentId: string | null = null
    let targetSortOrder = 0

    if (String(over.id).startsWith('folder-drop:')) {
      // 拖到文件夹上 → 成为该文件夹的子节点
      targetParentId = String(over.id).slice('folder-drop:'.length)
      // 防御：拖到自己或后代下
      if (targetParentId === draggedId || isDescendant(nodes, draggedId, targetParentId)) return
      // 父子未变（已经在该文件夹下）且序号末尾 → 不必重排
      const siblings = nodes.filter((n) => n.parentId === targetParentId && n.id !== draggedId)
      targetSortOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0
      // 自动展开文件夹
      const next = new Set(expanded); next.add(targetParentId); setExpanded(next)
    } else if (String(over.id) === 'root-drop') {
      // 拖到根
      targetParentId = null
      const siblings = nodes.filter((n) => !n.parentId && n.id !== draggedId)
      targetSortOrder = siblings.length > 0 ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0
    } else {
      // 排到某个节点的位置（同级）
      const overNode = nodes.find((n) => n.id === over.id)
      if (!overNode) return
      targetParentId = overNode.parentId ?? null
      if (targetParentId === draggedId || (targetParentId && isDescendant(nodes, draggedId, targetParentId))) return
      // 在 over 节点之前插入（取它的 sortOrder，并把它及之后整体后移）
      targetSortOrder = overNode.sortOrder
    }

    // 计算需要写回的批次：本节点 + 受影响兄弟节点重排
    const items = computeReorderBatch(nodes, draggedId, targetParentId, targetSortOrder)
    if (items.length === 0) return
    try {
      await reorderNodes(items)
    } catch (e) {
      alert('移动失败')
    }
  }

  if (tree.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
        <p className="mb-2">还没有文档</p>
        <button onClick={() => onCreateInFolder?.(null)} className="text-primary hover:underline">
          创建第一个 →
        </button>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <RootDropZone />
      <SortableContext items={flat.map((r) => r.node.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5 px-2">
          {flat.map(({ node, depth }) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={depth}
              expanded={expanded.has(node.id)}
              isActive={selectedId === node.id}
              onToggle={() => toggle(node.id)}
              onSelect={() => node.type === 'doc' ? selectDoc(node.id) : toggle(node.id)}
              onRename={(t) => updateNode(node.id, { title: t })}
              onDelete={() => {
                if (confirm(`确定删除 "${node.title}"？${node.type === 'folder' ? '子内容也会一并删除。' : ''}`))
                  removeNode(node.id)
              }}
              onCreateChildDoc={() => onCreateInFolder?.(node.id)}
              onCreateChildFolder={async () => {
                await createNode({ parentId: node.id, type: 'folder', title: '新文件夹' })
                const next = new Set(expanded); next.add(node.id); setExpanded(next)
              }}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeId ? (
          <div className="rounded-md border border-primary/60 bg-card/95 px-2 py-1 text-sm shadow-lg backdrop-blur">
            {nodes.find((n) => n.id === activeId)?.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function RootDropZone() {
  const { isOver, setNodeRef } = useDroppable({ id: 'root-drop' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mx-2 mb-1 rounded-md border border-dashed py-1 text-center text-[10px] transition-colors',
        isOver
          ? 'border-primary text-primary bg-primary/10'
          : 'border-transparent text-transparent hover:border-border/60 hover:text-muted-foreground',
      )}
    >
      拖到此处放至根目录
    </div>
  )
}

interface TreeRowProps {
  node: TreeItem
  depth: number
  expanded: boolean
  isActive: boolean
  onToggle: () => void
  onSelect: () => void
  onRename: (title: string) => void | Promise<void>
  onDelete: () => void
  onCreateChildDoc: () => void
  onCreateChildFolder: () => void | Promise<void>
}

function TreeRow({
  node, depth, expanded, isActive,
  onToggle, onSelect, onRename, onDelete, onCreateChildDoc, onCreateChildFolder,
}: TreeRowProps) {
  const sortable = useSortable({ id: node.id })
  const droppable = useDroppable({
    id: 'folder-drop:' + node.id,
    disabled: node.type !== 'folder',
  })

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.title)
  const isFolder = node.type === 'folder'

  const submit = async () => {
    setEditing(false)
    if (draft.trim() && draft !== node.title) await onRename(draft.trim())
    else setDraft(node.title)
  }

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
    paddingLeft: 6 + depth * 12,
    opacity: sortable.isDragging ? 0.4 : 1,
  }

  // 把 sortable + droppable 的 ref 合并
  const setRefs = (el: HTMLDivElement | null) => {
    sortable.setNodeRef(el)
    if (isFolder) droppable.setNodeRef(el)
  }

  return (
    <div
      ref={setRefs}
      style={style}
      className={cn(
        'group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm cursor-pointer transition-colors',
        isActive
          ? 'bg-primary/15 text-primary'
          : 'hover:bg-accent/60 text-foreground/90',
        isFolder && droppable.isOver && 'ring-2 ring-primary/60 bg-primary/10',
      )}
      onClick={onSelect}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
    >
      {/* 拖拽手柄 */}
      <button
        {...sortable.attributes}
        {...sortable.listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 hover:opacity-100 -ml-1"
        title="拖拽移动"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {isFolder ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="shrink-0"
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
      ) : (
        <span className="inline-block w-3.5" />
      )}

      {isFolder ? (
        expanded ? <FolderOpen className="h-4 w-4 shrink-0 text-blue-400" />
                 : <FolderClosed className="h-4 w-4 shrink-0 text-blue-400" />
      ) : (
        <FileCode className="h-4 w-4 shrink-0 text-violet-400" />
      )}

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            else if (e.key === 'Escape') { setEditing(false); setDraft(node.title) }
          }}
          className="flex-1 min-w-0 bg-background border rounded px-1.5 py-0 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <span className="flex-1 truncate">{node.title}</span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {isFolder && (
            <>
              <DropdownMenuItem onSelect={onCreateChildDoc}>
                <Plus className="h-4 w-4" /> 新建文档
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onCreateChildFolder}>
                <FolderClosed className="h-4 w-4" /> 新建子文件夹
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> 重命名
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={onDelete}>
            <Trash2 className="h-4 w-4" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ---------- 工具函数 ----------

function isDescendant(nodes: DocNode[], ancestor: string, candidate: string): boolean {
  let current: string | null | undefined = candidate
  for (let i = 0; i < 100 && current; i++) {
    const n = nodes.find((x) => x.id === current)
    if (!n) return false
    if (!n.parentId) return false
    if (n.parentId === ancestor) return true
    current = n.parentId
  }
  return false
}

function computeReorderBatch(
  nodes: DocNode[],
  draggedId: string,
  newParentId: string | null,
  newSortOrder: number,
): { id: string; parentId: string | null; sortOrder: number }[] {
  // 同级兄弟（不含被拖拽节点）
  const siblings = nodes
    .filter((n) => (n.parentId ?? null) === newParentId && n.id !== draggedId)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // 在 newSortOrder 位置之前 / 之后分两组
  const before = siblings.filter((s) => s.sortOrder < newSortOrder)
  const after = siblings.filter((s) => s.sortOrder >= newSortOrder)

  // 重新生成连续的 sortOrder
  const out: { id: string; parentId: string | null; sortOrder: number }[] = []
  let order = 0
  for (const s of before) out.push({ id: s.id, parentId: newParentId, sortOrder: order++ })
  out.push({ id: draggedId, parentId: newParentId, sortOrder: order++ })
  for (const s of after) out.push({ id: s.id, parentId: newParentId, sortOrder: order++ })

  return out
}
