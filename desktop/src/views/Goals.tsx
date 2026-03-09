import { useCallback, useEffect, useMemo, useState } from 'react';
import type { useGateway, TaskRun } from '../hooks/useGateway';
import { toast } from 'sonner';
import { Loader2, Target, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Goal, Task, GoalStatus, TaskStatus } from './goals/helpers';
import { errorText } from './goals/helpers';
import { KanbanBoard, type ColumnId } from './goals/KanbanBoard';

type Props = {
  gateway: ReturnType<typeof useGateway>;
  onViewSession?: (sessionId: string, channel?: string, chatId?: string, chatType?: string) => void;
  onSetupChat?: (prompt: string) => void;
  onOpenTask?: (taskId: string, taskTitle: string) => void;
};

export function GoalsView({ gateway, onViewSession, onSetupChat, onOpenTask }: Props) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const taskRuns = gateway.taskRuns as Record<string, TaskRun>;

  const load = useCallback(async () => {
    if (gateway.connectionState !== 'connected') return;
    try {
      const [goalsRes, tasksRes] = await Promise.all([
        gateway.rpc('projects.list'),
        gateway.rpc('tasks.list'),
      ]);
      if (Array.isArray(goalsRes)) setGoals(goalsRes as Goal[]);
      if (Array.isArray(tasksRes)) setTasks(tasksRes as Task[]);
    } catch (err) {
      toast.error('Failed to load projects', { description: errorText(err) });
    } finally {
      setLoading(false);
    }
  }, [gateway]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!loading) void load(); }, [gateway.goalsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const wrap = useCallback(async (key: string, fn: () => Promise<void>) => {
    setSaving(key);
    try { await fn(); await load(); }
    catch (err) { toast.error(errorText(err)); }
    finally { setSaving(null); }
  }, [load]);

  const createGoal = useCallback((title: string, description?: string) => {
    void wrap('goal:create', async () => {
      await gateway.rpc('projects.add', { title, description });
    });
  }, [gateway, wrap]);

  const toggleGoalStatus = useCallback((goal: Goal) => {
    const next: GoalStatus = goal.status === 'paused' ? 'active' : 'paused';
    void wrap(`goal:${goal.id}`, async () => {
      await gateway.rpc('projects.update', { id: goal.id, status: next });
    });
  }, [gateway, wrap]);

  const completeGoal = useCallback((goal: Goal) => {
    void wrap(`goal:${goal.id}`, async () => {
      await gateway.rpc('projects.update', { id: goal.id, status: 'done' as GoalStatus });
    });
  }, [gateway, wrap]);

  const deleteGoal = useCallback((goalId: string) => {
    void wrap(`goal:delete:${goalId}`, async () => {
      await gateway.rpc('projects.delete', { id: goalId });
    });
  }, [gateway, wrap]);

  const createTask = useCallback((title: string, goalId?: string, status?: string) => {
    void wrap('task:create', async () => {
      await gateway.rpc('tasks.add', {
        title,
        status: (status || 'todo') as TaskStatus,
        goalId: goalId || undefined,
      });
    });
  }, [gateway, wrap]);

  const moveTask = useCallback((taskId: string, toColumn: ColumnId, newGoalId?: string) => {
    const statusMap: Record<ColumnId, TaskStatus> = {
      todo: 'todo',
      in_progress: 'in_progress',
      review: 'review',
      done: 'done',
    };
    void wrap(`task:${taskId}:move`, async () => {
      const updates: Record<string, unknown> = { id: taskId, status: statusMap[toColumn] };
      if (newGoalId !== undefined) updates.goalId = newGoalId || null;
      await gateway.rpc('tasks.update', updates);
    });
  }, [gateway, wrap]);

  const handleTaskClick = useCallback((task: Task) => {
    if (onOpenTask) {
      onOpenTask(task.id, task.title);
    }
  }, [onOpenTask]);

  if (gateway.connectionState !== 'connected') {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        connecting...
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        loading...
      </div>
    );
  }

  const isEmpty = goals.length === 0 && tasks.length === 0;

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <Target className="h-8 w-8 text-muted-foreground/30" />
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">no projects yet</div>
          <div className="text-[11px] text-muted-foreground/60">create a project to start tracking work</div>
        </div>
        <div className="flex items-center gap-3">
          {onSetupChat && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onSetupChat('create projects for me based on my history, ask me questions')}
            >
              <Sparkles className="mr-1.5 h-3 w-3" />
              generate projects
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <KanbanBoard
      tasks={tasks}
      goals={goals}
      taskRuns={taskRuns}
      onTaskClick={handleTaskClick}
      onCreateTask={createTask}
      onMoveTask={moveTask}
      onCreateGoal={createGoal}
      onToggleGoalStatus={toggleGoalStatus}
      onCompleteGoal={completeGoal}
      onDeleteGoal={deleteGoal}
      busy={saving}
    />
  );
}
