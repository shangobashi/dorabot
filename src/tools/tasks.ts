import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getDb } from '../db.js';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked' | 'cancelled';

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

export type TasksState = {
  tasks: Task[];
  version: number;
};

// migrate legacy statuses from older data
const STATUS_MIGRATION: Record<string, TaskStatus> = {
  planning: 'todo',
  planned: 'todo',
  rework: 'in_progress',
};

function parseTaskRow(raw: string): Task {
  const task = JSON.parse(raw) as Task & { plan?: string; planDocPath?: string };
  const rawStatus = (task.status || 'todo') as string;
  // strip legacy plan fields on read
  const { plan: _plan, planDocPath: _planDocPath, ...rest } = task;
  return {
    ...rest,
    status: (STATUS_MIGRATION[rawStatus] || rawStatus) as TaskStatus,
  };
}

function nextId(tasks: Task[]): string {
  const ids = tasks.map(t => Number.parseInt(t.id, 10)).filter(n => Number.isFinite(n));
  return String((ids.length ? Math.max(...ids) : 0) + 1);
}

export function loadTasks(): TasksState {
  const db = getDb();
  const rows = db.prepare('SELECT data FROM tasks').all() as { data: string }[];
  const tasks = rows.map(row => parseTaskRow(row.data));
  const versionRow = db.prepare("SELECT value FROM tasks_meta WHERE key = 'version'").get() as { value: string } | undefined;
  return {
    tasks,
    version: versionRow ? Number.parseInt(versionRow.value, 10) : 1,
  };
}

export function saveTasks(state: TasksState): void {
  const db = getDb();
  state.version = (state.version || 0) + 1;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM tasks').run();
    const insert = db.prepare('INSERT INTO tasks (id, data) VALUES (?, ?)');
    for (const task of state.tasks) insert.run(task.id, JSON.stringify(task));
    db.prepare("INSERT OR REPLACE INTO tasks_meta (key, value) VALUES ('version', ?)").run(String(state.version));
  });
  tx();
}

export function appendTaskLog(taskId: string, eventType: string, message: string, data?: unknown): void {
  getDb().prepare(
    'INSERT INTO tasks_logs (task_id, event_type, message, data) VALUES (?, ?, ?, ?)',
  ).run(taskId, eventType, message, data ? JSON.stringify(data) : null);
}

export function readTaskLogs(taskId: string, limit = 50): Array<{
  id: number;
  taskId: string;
  eventType: string;
  message: string;
  data?: unknown;
  createdAt: string;
}> {
  const rows = getDb().prepare(`
    SELECT id, task_id, event_type, message, data, created_at
    FROM tasks_logs
    WHERE task_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(taskId, limit) as Array<{
    id: number;
    task_id: string;
    event_type: string;
    message: string;
    data: string | null;
    created_at: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    message: row.message,
    data: row.data ? JSON.parse(row.data) : undefined,
    createdAt: row.created_at,
  }));
}

function taskSummary(task: Task): string {
  const project = task.goalId ? ` project=${task.goalId}` : '';
  return `#${task.id} [${task.status}]${project} ${task.title}`;
}

export const tasksViewTool = tool(
  'tasks_view',
  'View tasks. Filter by status, projectId, or id.',
  {
    status: z.enum(['all', 'todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled']).optional(),
    filter: z.enum(['running', 'active', 'review']).optional()
      .describe('Quick filter. running = in_progress, review = needs human review, active = not done/cancelled'),
    goalId: z.string().optional().describe('Filter by project ID'),
    id: z.string().optional(),
    includeLogs: z.boolean().optional(),
  },
  async (args) => {
    const state = loadTasks();

    if (args.id) {
      const task = state.tasks.find(t => t.id === args.id);
      if (!task) return { content: [{ type: 'text', text: `Task #${args.id} not found` }], isError: true };
      const logs = args.includeLogs ? readTaskLogs(task.id, 20) : [];
      const lines = [
        taskSummary(task),
        task.reason ? `Reason: ${task.reason}` : '',
        task.result ? `\nResult:\n${task.result}` : '',
      ].filter(Boolean);

      if (logs.length) {
        lines.push('\nRecent logs:');
        for (const log of logs.reverse()) {
          lines.push(`- [${log.createdAt}] ${log.eventType}: ${log.message}`);
        }
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    const status = args.status || 'all';
    let tasks = status === 'all' ? state.tasks : state.tasks.filter(t => t.status === status);
    if (args.goalId) tasks = tasks.filter(t => t.goalId === args.goalId);

    if (args.filter) {
      const DISMISSED = new Set(['done', 'cancelled']);
      tasks = tasks.filter(t => {
        switch (args.filter) {
          case 'running': return t.status === 'in_progress';
          case 'review': return t.status === 'review';
          case 'active': return !DISMISSED.has(t.status);
          default: return true;
        }
      });
    }

    if (!tasks.length) {
      return { content: [{ type: 'text', text: 'No tasks found.' }] };
    }

    const lines = tasks
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(taskSummary)
      .join('\n');
    return { content: [{ type: 'text', text: `Tasks (${tasks.length}):\n\n${lines}` }] };
  },
);

export const tasksAddTool = tool(
  'tasks_add',
  'Create a task.',
  {
    title: z.string(),
    goalId: z.string().optional().describe('Project ID to assign to'),
    status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled']).optional(),
    reason: z.string().optional(),
  },
  async (args) => {
    const state = loadTasks();
    const now = new Date().toISOString();
    const id = nextId(state.tasks);
    const task: Task = {
      id,
      goalId: args.goalId,
      title: args.title,
      status: args.status || 'todo',
      reason: args.reason,
      createdAt: now,
      updatedAt: now,
    };
    state.tasks.push(task);
    saveTasks(state);
    appendTaskLog(task.id, 'task_add', `Task created: ${task.title}`);
    return { content: [{ type: 'text', text: `Task #${task.id} created: ${task.title}` }] };
  },
);

export const tasksUpdateTool = tool(
  'tasks_update',
  'Update task fields.',
  {
    id: z.string(),
    title: z.string().optional(),
    goalId: z.string().nullable().optional().describe('Project ID, or null to unassign'),
    status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked', 'cancelled']).optional(),
    result: z.string().optional(),
    reason: z.string().optional(),
    sessionId: z.string().optional(),
    sessionKey: z.string().optional(),
  },
  async (args) => {
    const state = loadTasks();
    const task = state.tasks.find(t => t.id === args.id);
    if (!task) return { content: [{ type: 'text', text: `Task #${args.id} not found` }], isError: true };

    if (args.title !== undefined) task.title = args.title;
    if (args.goalId !== undefined) task.goalId = args.goalId || undefined;
    if (args.status !== undefined) task.status = args.status;
    if (args.result !== undefined) task.result = args.result;
    if (args.reason !== undefined) task.reason = args.reason;
    if (args.sessionId !== undefined) task.sessionId = args.sessionId;
    if (args.sessionKey !== undefined) task.sessionKey = args.sessionKey;
    task.updatedAt = new Date().toISOString();
    if (task.status === 'done' && !task.completedAt) task.completedAt = task.updatedAt;
    if (task.status !== 'done') task.completedAt = undefined;
    saveTasks(state);

    const changes: string[] = [];
    if (args.status) changes.push(`status=${args.status}`);
    if (args.goalId !== undefined) changes.push(`project=${args.goalId || 'none'}`);
    appendTaskLog(task.id, 'task_update', changes.join(', ') || 'updated');
    return { content: [{ type: 'text', text: `Task #${task.id} updated` }] };
  },
);

export const tasksDoneTool = tool(
  'tasks_done',
  'Mark task as done and optionally set result.',
  {
    id: z.string(),
    result: z.string().optional(),
  },
  async (args) => {
    const state = loadTasks();
    const task = state.tasks.find(t => t.id === args.id);
    if (!task) return { content: [{ type: 'text', text: `Task #${args.id} not found` }], isError: true };
    const now = new Date().toISOString();

    task.status = 'done';
    if (args.result !== undefined) task.result = args.result;
    task.updatedAt = now;
    task.completedAt = now;
    saveTasks(state);
    appendTaskLog(task.id, 'task_done', 'Task marked done');
    return { content: [{ type: 'text', text: `Task #${task.id} marked done` }] };
  },
);

export const tasksDeleteTool = tool(
  'tasks_delete',
  'Delete a task.',
  {
    id: z.string(),
  },
  async (args) => {
    const state = loadTasks();
    const before = state.tasks.length;
    state.tasks = state.tasks.filter(t => t.id !== args.id);
    if (state.tasks.length === before) {
      return { content: [{ type: 'text', text: `Task #${args.id} not found` }], isError: true };
    }
    saveTasks(state);
    appendTaskLog(args.id, 'task_delete', `Task #${args.id} deleted`);
    return { content: [{ type: 'text', text: `Task #${args.id} deleted` }] };
  },
);

export const tasksTools = [
  tasksViewTool,
  tasksAddTool,
  tasksUpdateTool,
  tasksDoneTool,
  tasksDeleteTool,
];
