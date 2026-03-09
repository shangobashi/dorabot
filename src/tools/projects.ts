import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getDb } from '../db.js';

export type ProjectStatus = 'active' | 'paused' | 'done';

export type Project = {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  tags?: string[];
  reason?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectsState = {
  projects: Project[];
  version: number;
};

// DB tables are still named "goals"/"goals_meta_v2" for backward compat
function parseRow(raw: string): Project {
  const project = JSON.parse(raw) as Project;
  return {
    ...project,
    status: project.status || 'active',
    tags: Array.isArray(project.tags) ? project.tags : [],
  };
}

function nextId(projects: Project[]): string {
  const ids = projects.map(p => Number.parseInt(p.id, 10)).filter(n => Number.isFinite(n));
  return String((ids.length ? Math.max(...ids) : 0) + 1);
}

export function loadProjects(): ProjectsState {
  const db = getDb();
  const rows = db.prepare('SELECT data FROM goals').all() as { data: string }[];
  const projects = rows.map(row => parseRow(row.data));
  const versionRow = db.prepare("SELECT value FROM goals_meta_v2 WHERE key = 'version'").get() as { value: string } | undefined;
  return {
    projects,
    version: versionRow ? Number.parseInt(versionRow.value, 10) : 1,
  };
}

export function saveProjects(state: ProjectsState): void {
  const db = getDb();
  state.version = (state.version || 0) + 1;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM goals').run();
    const insert = db.prepare('INSERT INTO goals (id, data) VALUES (?, ?)');
    for (const project of state.projects) insert.run(project.id, JSON.stringify(project));
    db.prepare("INSERT OR REPLACE INTO goals_meta_v2 (key, value) VALUES ('version', ?)").run(String(state.version));
  });
  tx();
}

function projectSummary(project: Project): string {
  const tags = project.tags?.length ? ` [${project.tags.join(', ')}]` : '';
  return `#${project.id} [${project.status}] ${project.title}${tags}`;
}

export const projectsViewTool = tool(
  'projects_view',
  'View projects and their status.',
  {
    status: z.enum(['all', 'active', 'paused', 'done']).optional(),
    id: z.string().optional(),
  },
  async (args) => {
    const state = loadProjects();

    if (args.id) {
      const project = state.projects.find(p => p.id === args.id);
      if (!project) return { content: [{ type: 'text', text: `Project #${args.id} not found` }], isError: true };
      const lines = [
        projectSummary(project),
        project.description ? `Description: ${project.description}` : '',
        project.reason ? `Reason: ${project.reason}` : '',
        project.tags?.length ? `Tags: ${project.tags.join(', ')}` : '',
      ].filter(Boolean);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    const status = args.status || 'all';
    const projects = status === 'all' ? state.projects : state.projects.filter(p => p.status === status);
    if (!projects.length) {
      return { content: [{ type: 'text', text: status === 'all' ? 'No projects.' : `No projects with status: ${status}` }] };
    }
    const lines = projects
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(projectSummary)
      .join('\n');
    return { content: [{ type: 'text', text: `Projects (${projects.length}):\n\n${lines}` }] };
  },
);

export const projectsAddTool = tool(
  'projects_add',
  'Create a project.',
  {
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  },
  async (args) => {
    const state = loadProjects();
    const now = new Date().toISOString();
    const project: Project = {
      id: nextId(state.projects),
      title: args.title,
      description: args.description,
      status: 'active',
      tags: args.tags || [],
      createdAt: now,
      updatedAt: now,
    };
    state.projects.push(project);
    saveProjects(state);
    return { content: [{ type: 'text', text: `Project #${project.id} created: ${project.title}` }] };
  },
);

export const projectsUpdateTool = tool(
  'projects_update',
  'Update project fields.',
  {
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['active', 'paused', 'done']).optional(),
    tags: z.array(z.string()).optional(),
    reason: z.string().optional(),
  },
  async (args) => {
    const state = loadProjects();
    const project = state.projects.find(p => p.id === args.id);
    if (!project) return { content: [{ type: 'text', text: `Project #${args.id} not found` }], isError: true };

    if (args.title !== undefined) project.title = args.title;
    if (args.description !== undefined) project.description = args.description;
    if (args.status !== undefined) project.status = args.status;
    if (args.tags !== undefined) project.tags = args.tags;
    if (args.reason !== undefined) project.reason = args.reason;
    project.updatedAt = new Date().toISOString();
    saveProjects(state);
    return { content: [{ type: 'text', text: `Project #${project.id} updated` }] };
  },
);

export const projectsDeleteTool = tool(
  'projects_delete',
  'Delete a project.',
  {
    id: z.string(),
  },
  async (args) => {
    const state = loadProjects();
    const before = state.projects.length;
    state.projects = state.projects.filter(p => p.id !== args.id);
    if (state.projects.length === before) {
      return { content: [{ type: 'text', text: `Project #${args.id} not found` }], isError: true };
    }
    saveProjects(state);
    return { content: [{ type: 'text', text: `Project #${args.id} deleted` }] };
  },
);

export const projectsTools = [
  projectsViewTool,
  projectsAddTool,
  projectsUpdateTool,
  projectsDeleteTool,
];
