import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import {
  CircleDot, Timer, Eye, CheckCircle2,
  AlertTriangle, XCircle,
} from 'lucide-react';
import type { Task } from './helpers';
import type { ColumnId } from './KanbanBoard';

type Props = {
  task: Task;
  columnId: ColumnId;
  onClick: () => void;
};

function shortId(id: string): string {
  const raw = id.replace(/^(task_|tsk_)/, '');
  return raw.slice(0, 4).toUpperCase();
}

const STATUS_ICON: Record<string, { icon: typeof CircleDot; color: string }> = {
  todo: { icon: CircleDot, color: 'text-muted-foreground/40' },
  in_progress: { icon: Timer, color: 'text-amber-500' },
  review: { icon: Eye, color: 'text-orange-500' },
  done: { icon: CheckCircle2, color: 'text-emerald-500' },
  blocked: { icon: AlertTriangle, color: 'text-destructive/70' },
  cancelled: { icon: XCircle, color: 'text-muted-foreground/30' },
};

export function KanbanCard({ task, columnId, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task, fromColumn: columnId },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const statusDef = STATUS_ICON[task.status] || STATUS_ICON.todo;
  const StatusIcon = statusDef.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'rounded-lg border border-border/60 bg-card p-2.5 cursor-pointer transition-all',
        'hover:border-border hover:shadow-sm',
        isDragging && 'opacity-30 shadow-lg z-50',
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <StatusIcon className={cn('h-4 w-4 shrink-0 mt-[1px]', statusDef.color)} />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] leading-snug font-medium line-clamp-2">
            {task.title}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/30 mt-1">
            {shortId(task.id)}
          </div>
        </div>
      </div>
    </div>
  );
}
