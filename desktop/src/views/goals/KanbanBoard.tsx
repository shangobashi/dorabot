import { useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, type DragStartEvent, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CircleDot, Timer, Eye, CheckCircle2,
  Plus, Target, MoreHorizontal, ChevronDown,
  Pause, Play, Check, Trash2, Ban, AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { LucideIcon } from 'lucide-react';
import type { TaskRun } from '../../hooks/useGateway';
import type { Task, Goal, TaskStatus } from './helpers';
import { KanbanColumn } from './KanbanColumn';

export type ColumnId = 'todo' | 'in_progress' | 'review' | 'done';

type ColumnDef = {
  id: ColumnId;
  title: string;
  icon: LucideIcon;
  iconColor: string;
};

const COLUMNS: ColumnDef[] = [
  { id: 'todo', title: 'Todo', icon: CircleDot, iconColor: 'text-muted-foreground' },
  { id: 'in_progress', title: 'In Progress', icon: Timer, iconColor: 'text-amber-500' },
  { id: 'review', title: 'Review', icon: Eye, iconColor: 'text-orange-500' },
  { id: 'done', title: 'Done', icon: CheckCircle2, iconColor: 'text-emerald-500' },
];

const COLUMN_TO_STATUS: Record<ColumnId, TaskStatus> = {
  todo: 'todo',
  in_progress: 'in_progress',
  review: 'review',
  done: 'done',
};

const VALID_COLUMNS = new Set<string>(COLUMNS.map(c => c.id));

export function getColumnForTask(task: Task, taskRuns: Record<string, TaskRun>): ColumnId {
  const running = taskRuns[task.id]?.status === 'started';
  if (running || task.status === 'in_progress') return 'in_progress';
  if (task.status === 'review') return 'review';
  if (task.status === 'done') return 'done';
  return 'todo';
}

type Props = {
  tasks: Task[];
  goals: Goal[];
  taskRuns: Record<string, TaskRun>;
  onTaskClick: (task: Task) => void;
  onCreateTask: (title: string, goalId?: string, status?: string) => void;
  onMoveTask: (taskId: string, toColumn: ColumnId, newGoalId?: string) => void;
  onCreateGoal: (title: string, description?: string) => void;
  onToggleGoalStatus: (goal: Goal) => void;
  onCompleteGoal: (goal: Goal) => void;
  onDeleteGoal: (goalId: string) => void;
  busy?: string | null;
};

function ProjectHeader({
  goal,
  taskCount,
  doneCount,
  blockedCount,
  onToggleGoalStatus,
  onCompleteGoal,
  onDeleteGoal,
}: {
  goal: Goal | null;
  taskCount: number;
  doneCount: number;
  blockedCount: number;
  onToggleGoalStatus?: (goal: Goal) => void;
  onCompleteGoal?: (goal: Goal) => void;
  onDeleteGoal?: (goalId: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30">
      <Target className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium">
          {goal ? goal.title : 'Unassigned'}
        </span>
        {goal?.description && (
          <span className="text-[11px] text-muted-foreground/50 ml-2">
            {goal.description}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground/40">
        {blockedCount > 0 && (
          <span className="flex items-center gap-0.5 text-destructive/50">
            <AlertTriangle className="h-2.5 w-2.5" />
            {blockedCount}
          </span>
        )}
        <span>{doneCount}/{taskCount}</span>
      </div>

      {goal && onToggleGoalStatus && onCompleteGoal && onDeleteGoal && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/50 transition-colors shrink-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onToggleGoalStatus(goal)}>
              {goal.status === 'paused' ? (
                <><Play className="mr-2 h-3.5 w-3.5" /> Resume</>
              ) : (
                <><Pause className="mr-2 h-3.5 w-3.5" /> Pause</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCompleteGoal(goal)}>
              <Check className="mr-2 h-3.5 w-3.5" /> Complete
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDeleteGoal(goal.id)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {goal?.status === 'paused' && (
        <span className="text-[9px] text-amber-500/70 font-medium uppercase">paused</span>
      )}
    </div>
  );
}

export function KanbanBoard({
  tasks, goals, taskRuns,
  onTaskClick, onCreateTask, onMoveTask, onCreateGoal,
  onToggleGoalStatus, onCompleteGoal, onDeleteGoal,
  busy,
}: Props) {
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const activeGoals = useMemo(
    () => goals.filter(g => g.status !== 'done').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [goals],
  );

  const doneGoals = useMemo(
    () => goals.filter(g => g.status === 'done'),
    [goals],
  );

  const tasksByGoal = useMemo(() => {
    const map = new Map<string, Task[]>();
    const orphan: Task[] = [];
    for (const g of goals) map.set(g.id, []);
    for (const t of tasks) {
      if (t.goalId && map.has(t.goalId)) {
        map.get(t.goalId)!.push(t);
      } else {
        orphan.push(t);
      }
    }
    return { map, orphan };
  }, [tasks, goals]);

  const tasksById = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasksById.get(event.active.id as string);
    setActiveTask(task || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const overId = over.id as string;
    const sepIdx = overId.indexOf(':');
    if (sepIdx === -1) return;
    const targetGoalId = overId.slice(0, sepIdx) || undefined;
    const targetColumn = overId.slice(sepIdx + 1);
    if (!VALID_COLUMNS.has(targetColumn)) return;

    const taskId = active.id as string;
    const task = tasksById.get(taskId);
    if (!task) return;

    const currentColumn = getColumnForTask(task, taskRuns);
    const goalChanged = (task.goalId || '') !== (targetGoalId || '');
    if (currentColumn === targetColumn && !goalChanged) return;

    onMoveTask(taskId, targetColumn as ColumnId, targetGoalId);
  };

  const handleCreateGoal = () => {
    const t = newGoalTitle.trim();
    if (!t) return;
    onCreateGoal(t);
    setNewGoalTitle('');
    setShowGoalForm(false);
  };

  const handleCreateInColumn = (title: string, columnId: ColumnId, goalId?: string) => {
    onCreateTask(title, goalId, COLUMN_TO_STATUS[columnId]);
  };

  const renderProjectBoard = (goal: Goal | null, projectTasks: Task[]) => {
    const tasksByColumn = new Map<ColumnId, Task[]>();
    for (const col of COLUMNS) tasksByColumn.set(col.id, []);
    for (const task of projectTasks) {
      const col = getColumnForTask(task, taskRuns);
      tasksByColumn.get(col)?.push(task);
    }
    for (const [, arr] of tasksByColumn) {
      arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    const blockedCount = projectTasks.filter(t => t.status === 'blocked').length;
    const doneCount = projectTasks.filter(t => t.status === 'done').length;
    const droppablePrefix = goal?.id || '';

    return (
      <div key={goal?.id || '__orphan'} className="rounded-lg border border-border/40 bg-card/30">
        <ProjectHeader
          goal={goal}
          taskCount={projectTasks.length}
          doneCount={doneCount}
          blockedCount={blockedCount}
          onToggleGoalStatus={goal ? onToggleGoalStatus : undefined}
          onCompleteGoal={goal ? onCompleteGoal : undefined}
          onDeleteGoal={goal ? onDeleteGoal : undefined}
        />
        <div className="flex overflow-x-auto p-1.5 gap-0">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              droppableId={`${droppablePrefix}:${col.id}`}
              title={col.title}
              icon={col.icon}
              iconColor={col.iconColor}
              tasks={tasksByColumn.get(col.id) || []}
              onTaskClick={onTaskClick}
              onCreateTask={(title) => handleCreateInColumn(title, col.id, goal?.id)}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-full overflow-y-auto">
        <div className="space-y-3 p-4">
          {/* header */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Projects
            </span>
            <button
              type="button"
              className="h-4 w-4 flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setShowGoalForm(v => !v)}
              title="New project"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          </div>

          {/* new project form */}
          {showGoalForm && (
            <div className="flex items-center gap-2">
              <Input
                value={newGoalTitle}
                onChange={e => setNewGoalTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateGoal();
                  if (e.key === 'Escape') { setShowGoalForm(false); setNewGoalTitle(''); }
                }}
                placeholder="Project name..."
                className="h-7 text-xs max-w-xs"
                autoFocus
              />
              <Button size="sm" className="h-7 text-xs" onClick={handleCreateGoal} disabled={!newGoalTitle.trim()}>
                Create
              </Button>
            </div>
          )}

          {/* active project boards */}
          {activeGoals.map(goal => renderProjectBoard(goal, tasksByGoal.map.get(goal.id) || []))}

          {/* orphan tasks */}
          {tasksByGoal.orphan.length > 0 && renderProjectBoard(null, tasksByGoal.orphan)}

          {/* completed projects */}
          {doneGoals.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
                onClick={() => setShowArchive(v => !v)}
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', !showArchive && '-rotate-90')} />
                Completed ({doneGoals.length})
              </button>
              {showArchive && (
                <div className="mt-1.5 space-y-1">
                  {doneGoals.map(goal => (
                    <div key={goal.id} className="rounded-md px-3 py-1.5 flex items-center gap-2 text-muted-foreground/40">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500/30" />
                      <span className="text-[11px]">{goal.title}</span>
                      <span className="text-[10px] ml-auto">
                        {(tasksByGoal.map.get(goal.id) || []).length} tasks
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* drag overlay */}
      <DragOverlay>
        {activeTask && (
          <div className="rounded-md bg-card border border-border/50 px-2 py-1.5 shadow-lg opacity-90 max-w-[200px]">
            <div className="text-[12px] leading-snug truncate">{activeTask.title}</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
