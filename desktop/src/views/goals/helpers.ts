import type { TaskRun } from '../../hooks/useGateway';

export type GoalStatus = 'active' | 'paused' | 'done';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' | 'cancelled';

export type Goal = {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  tags?: string[];
  reason?: string;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: string;
  goalId?: string;
  title: string;
  status: TaskStatus;
  result?: string;
  reason?: string;
  sessionId?: string;
  sessionKey?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type TaskLog = {
  id: number;
  taskId: string;
  eventType: string;
  message: string;
  createdAt: string;
};

export type TaskPresentation = {
  label: string;
  dotClass: string;
  action: 'start' | 'watch' | 'unblock' | null;
};

export function getTaskPresentation(
  task: Task,
  taskRuns: Record<string, TaskRun>,
): TaskPresentation {
  const running = taskRuns[task.id]?.status === 'started';

  if (running || task.status === 'in_progress') {
    return {
      label: 'running',
      dotClass: 'bg-foreground animate-pulse',
      action: task.sessionId || task.sessionKey ? 'watch' : null,
    };
  }

  if (task.status === 'review') {
    return { label: 'review', dotClass: 'bg-orange-500', action: null };
  }

  if (task.status === 'todo') {
    return { label: 'todo', dotClass: 'bg-muted-foreground/40', action: 'start' };
  }

  if (task.status === 'blocked') {
    return { label: 'blocked', dotClass: 'bg-destructive', action: 'unblock' };
  }

  if (task.status === 'done') {
    return { label: 'done', dotClass: 'bg-muted-foreground/20', action: null };
  }

  return { label: 'cancelled', dotClass: 'bg-muted-foreground/20', action: null };
}

export function parseSessionKey(sessionKey?: string): { channel: string; chatType: string; chatId: string } | null {
  if (!sessionKey) return null;
  const [channel = 'desktop', chatType = 'dm', ...rest] = sessionKey.split(':');
  const chatId = rest.join(':');
  if (!chatId) return null;
  return { channel, chatType, chatId };
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err || 'unknown error');
}
