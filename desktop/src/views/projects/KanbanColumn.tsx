import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Task } from './helpers';
import type { ColumnId } from './KanbanBoard';
import { KanbanCard } from './KanbanCard';

type Props = {
  id: ColumnId;
  droppableId: string;
  title: string;
  icon: LucideIcon;
  iconColor: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onCreateTask: (title: string) => void;
};

export function KanbanColumn({
  id, droppableId, title, icon: Icon, iconColor, tasks,
  onTaskClick, onCreateTask,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleAdd = () => {
    const t = newTitle.trim();
    if (!t) return;
    onCreateTask(t);
    setNewTitle('');
    setShowAdd(false);
  };

  return (
    <div className="flex flex-col flex-1 min-w-[180px]">
      {/* column header */}
      <div className="flex items-center gap-1.5 px-2 py-1 mb-0.5">
        <Icon className={cn('h-3 w-3', iconColor)} />
        <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
        {tasks.length > 0 && (
          <span className="text-[10px] text-muted-foreground/30">{tasks.length}</span>
        )}
        <button
          type="button"
          className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/20 hover:text-muted-foreground hover:bg-muted/50 transition-colors ml-auto"
          onClick={() => setShowAdd(v => !v)}
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* inline add */}
      {showAdd && (
        <div className="px-2 mb-1">
          <Input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setShowAdd(false); setNewTitle(''); }
            }}
            placeholder="Task title..."
            className="h-7 text-[11px]"
            autoFocus
          />
        </div>
      )}

      {/* droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-1.5 px-0.5 pb-2 min-h-[32px] rounded transition-colors',
          isOver && 'bg-primary/5 ring-1 ring-primary/20',
        )}
      >
        {tasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            columnId={id}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </div>
    </div>
  );
}
