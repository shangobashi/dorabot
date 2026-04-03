import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertTriangle,
  Check,
  Clock,
  ExternalLink,
  FileCode,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { DiffViewer } from '@/components/viewers/DiffViewer';
import type { useGateway } from '../hooks/useGateway';

type Props = {
  repoRoot: string;
  prNumber: number;
  gateway: ReturnType<typeof useGateway>;
};

type RpcFlags = {
  ghMissing?: boolean;
  ghAuthError?: boolean;
  notFound?: boolean;
  networkError?: boolean;
};

type PrCheck = {
  __typename?: string;
  context?: string;
  name?: string;
  state?: string;
  status?: string;
  conclusion?: string;
  targetUrl?: string;
};

type PrFile = {
  path: string;
  status: string;
  previousFilename?: string | null;
  additions: number;
  deletions: number;
  changes?: number;
  binary?: boolean;
};

type PullRequestData = {
  number: number;
  title: string;
  body: string;
  author?: {
    login?: string;
    name?: string | null;
    is_bot?: boolean;
  };
  state: string;
  isDraft: boolean;
  headRefName: string;
  headRefOid?: string;
  headRepoFullName?: string;
  baseRefName: string;
  baseRefOid?: string;
  baseRepoFullName?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string | null;
  closedAt?: string | null;
  labels?: Array<{ name: string; color?: string; description?: string }>;
  reviewDecision?: string;
  statusCheckRollup?: PrCheck[];
  mergeable?: string;
  mergeStateStatus?: string;
  files: PrFile[];
};

type TimelineItem = {
  id: string;
  kind: 'comment' | 'review' | 'reviewComment';
  author: string;
  authorAssociation?: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  url?: string;
  path?: string | null;
  line?: number | null;
  reviewState?: string | null;
};

type PrViewResponse = RpcFlags & {
  pr: PullRequestData | null;
};

type PrCommentsResponse = RpcFlags & {
  timeline: TimelineItem[];
};

type PrFileDiffResponse = RpcFlags & {
  oldContent: string;
  newContent: string;
  status?: string;
  previousFilename?: string | null;
  isBinary?: boolean;
  isTooLarge?: boolean;
};

type FileDiffCacheEntry = {
  loading: boolean;
  data?: PrFileDiffResponse;
  error?: string;
};

type CheckSummary = {
  tone: 'success' | 'warning' | 'danger' | 'muted';
  label: string;
  details: Array<{ label: string; state: string; url?: string }>;
};

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return 'unknown';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function stateLabel(value?: string | null): string {
  if (!value) return 'Unknown';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function fileStatusShort(status: string): string {
  switch (status) {
    case 'added': return 'A';
    case 'removed': return 'D';
    case 'renamed': return 'R';
    case 'copied': return 'C';
    default: return 'M';
  }
}

function checkStateTone(state?: string | null): 'success' | 'warning' | 'danger' | 'muted' {
  const normalized = String(state || '').toUpperCase();
  if (['SUCCESS', 'APPROVED', 'COMPLETED'].includes(normalized)) return 'success';
  if (['FAILURE', 'FAILED', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'CHANGES_REQUESTED'].includes(normalized)) return 'danger';
  if (['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED', 'STALE', 'REVIEW_REQUIRED'].includes(normalized)) return 'warning';
  return 'muted';
}

function toneClasses(tone: 'success' | 'warning' | 'danger' | 'muted'): string {
  switch (tone) {
    case 'success': return 'border-success/20 bg-success/10 text-success';
    case 'warning': return 'border-warning/20 bg-warning/10 text-warning';
    case 'danger': return 'border-destructive/20 bg-destructive/10 text-destructive';
    default: return 'border-border/60 bg-secondary/35 text-muted-foreground';
  }
}

function summarizeChecks(checks: PrCheck[] | undefined): CheckSummary {
  const items = Array.isArray(checks) ? checks : [];
  if (items.length === 0) return { tone: 'muted', label: 'No checks reported', details: [] };

  let success = 0;
  let danger = 0;
  let warning = 0;
  const details = items.map((item) => {
    const state = String(item.conclusion || item.state || item.status || 'UNKNOWN').toUpperCase();
    const tone = checkStateTone(state);
    if (tone === 'success') success += 1;
    else if (tone === 'danger') danger += 1;
    else if (tone === 'warning') warning += 1;
    return {
      label: item.context || item.name || item.__typename || 'Check',
      state,
      url: item.targetUrl,
    };
  });

  if (danger > 0) {
    return {
      tone: 'danger',
      label: `${danger} failing ${danger === 1 ? 'check' : 'checks'}`,
      details,
    };
  }
  if (warning > 0) {
    return {
      tone: 'warning',
      label: `${warning} pending ${warning === 1 ? 'check' : 'checks'}`,
      details,
    };
  }
  return {
    tone: 'success',
    label: `${success} passing ${success === 1 ? 'check' : 'checks'}`,
    details,
  };
}

function mergeLabel(mergeable?: string | null, mergeStateStatus?: string | null): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  const normalized = String(mergeable || '').toUpperCase();
  const mergeState = String(mergeStateStatus || '').toUpperCase();
  if (normalized === 'MERGEABLE') {
    return { label: mergeState ? `Mergeable · ${stateLabel(mergeState)}` : 'Mergeable', tone: mergeState === 'UNSTABLE' ? 'warning' : 'success' };
  }
  if (normalized === 'CONFLICTING') return { label: 'Has merge conflicts', tone: 'danger' };
  if (mergeState === 'BLOCKED') return { label: 'Merge blocked', tone: 'warning' };
  return { label: mergeState ? stateLabel(mergeState) : 'Merge state unknown', tone: 'muted' };
}

function reviewLabel(decision?: string | null): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  const normalized = String(decision || '').toUpperCase();
  if (normalized === 'APPROVED') return { label: 'Approved', tone: 'success' };
  if (normalized === 'CHANGES_REQUESTED') return { label: 'Changes requested', tone: 'danger' };
  if (normalized === 'REVIEW_REQUIRED') return { label: 'Review required', tone: 'warning' };
  return { label: 'No decision', tone: 'muted' };
}

function errorState(flags?: RpcFlags | null): { title: string; detail: string; link?: string; linkLabel?: string } | null {
  if (!flags) return null;
  if (flags.ghMissing) {
    return {
      title: 'GitHub CLI not installed',
      detail: 'This view depends on `gh` to load PR data.',
      link: 'https://cli.github.com/',
      linkLabel: 'Install gh',
    };
  }
  if (flags.ghAuthError) {
    return {
      title: 'GitHub authentication required',
      detail: 'Run `gh auth login` in this repo to load pull requests.',
    };
  }
  if (flags.notFound) {
    return {
      title: 'Pull request not found',
      detail: 'The PR may have been deleted, closed in another repo context, or the number is wrong.',
    };
  }
  if (flags.networkError) {
    return {
      title: 'Could not reach GitHub',
      detail: 'Check your connection and try again.',
    };
  }
  return null;
}

function MetricPill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]', className)}>
      {children}
    </span>
  );
}

function RailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-border/50 pt-4 first:border-t-0 first:pt-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      {children}
    </section>
  );
}

function EmptyPanel({
  title,
  detail,
  onRetry,
  actionLabel,
  actionHref,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-sm space-y-3 rounded-2xl border border-border/60 bg-card/60 p-6 text-center shadow-sm">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-border/60 bg-secondary/35">
          <AlertTriangle className="size-4 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[12px] leading-relaxed text-muted-foreground">{detail}</div>
        </div>
        <div className="flex items-center justify-center gap-2">
          {onRetry ? (
            <Button variant="outline" size="xs" onClick={onRetry}>
              <RefreshCw className="size-3" />
              Retry
            </Button>
          ) : null}
          {actionHref && actionLabel ? (
            <Button asChild variant="ghost" size="xs">
              <a href={actionHref} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3" />
                {actionLabel}
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-6 py-5">
        <Skeleton className="mb-3 h-5 w-20" />
        <Skeleton className="mb-2 h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-0 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-5 px-6 py-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <div className="hidden border-l border-border/60 px-4 py-6 xl:block">
          <Skeleton className="mb-4 h-24 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function PullRequestView({ repoRoot, prNumber, gateway }: Props) {
  const [mode, setMode] = useState<'overview' | 'files'>('overview');
  const [fileQuery, setFileQuery] = useState('');
  const deferredFileQuery = useDeferredValue(fileQuery);
  const [viewState, setViewState] = useState<{
    loading: boolean;
    data: PullRequestData | null;
    flags: RpcFlags;
    error: string | null;
  }>({
    loading: true,
    data: null,
    flags: {},
    error: null,
  });
  const [timelineState, setTimelineState] = useState<{
    loading: boolean;
    data: TimelineItem[];
    flags: RpcFlags;
    error: string | null;
  }>({
    loading: true,
    data: [],
    flags: {},
    error: null,
  });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiffs, setFileDiffs] = useState<Record<string, FileDiffCacheEntry>>({});

  const loadAll = useCallback(async () => {
    setViewState(prev => ({ ...prev, loading: true, error: null }));
    setTimelineState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const [viewRes, commentsRes] = await Promise.all([
        gateway.rpc('git.prView', { path: repoRoot, number: prNumber }) as Promise<PrViewResponse>,
        gateway.rpc('git.prComments', { path: repoRoot, number: prNumber }) as Promise<PrCommentsResponse>,
      ]);

      setViewState({
        loading: false,
        data: viewRes.pr || null,
        flags: {
          ghMissing: viewRes.ghMissing,
          ghAuthError: viewRes.ghAuthError,
          notFound: viewRes.notFound,
          networkError: viewRes.networkError,
        },
        error: null,
      });
      setTimelineState({
        loading: false,
        data: Array.isArray(commentsRes.timeline) ? commentsRes.timeline : [],
        flags: {
          ghMissing: commentsRes.ghMissing,
          ghAuthError: commentsRes.ghAuthError,
          notFound: commentsRes.notFound,
          networkError: commentsRes.networkError,
        },
        error: null,
      });
      setFileDiffs({});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setViewState({ loading: false, data: null, flags: {}, error: message });
      setTimelineState({ loading: false, data: [], flags: {}, error: message });
    }
  }, [gateway, prNumber, repoRoot]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const firstFile = viewState.data?.files?.[0]?.path || null;
    if (!viewState.data) {
      setSelectedFile(null);
      return;
    }
    if (selectedFile && viewState.data.files.some(file => file.path === selectedFile)) return;
    setSelectedFile(firstFile);
  }, [selectedFile, viewState.data]);

  const loadFileDiff = useCallback(async (filePath: string) => {
    const existing = fileDiffs[filePath];
    if (existing?.loading || existing?.data || existing?.error) return;
    const fileMeta = viewState.data?.files.find(file => file.path === filePath);
    if (!fileMeta || !viewState.data?.baseRefOid || !viewState.data?.headRefOid || !viewState.data?.baseRepoFullName || !viewState.data?.headRepoFullName) {
      setFileDiffs(prev => ({
        ...prev,
        [filePath]: {
          loading: false,
          error: 'Missing PR metadata for this diff.',
        },
      }));
      return;
    }

    setFileDiffs(prev => ({
      ...prev,
      [filePath]: { loading: true },
    }));

    try {
      const response = await gateway.rpc('git.prFileDiff', {
        path: repoRoot,
        number: prNumber,
        file: filePath,
        status: fileMeta.status,
        previousFilename: fileMeta.previousFilename,
        baseRepoFullName: viewState.data.baseRepoFullName,
        headRepoFullName: viewState.data.headRepoFullName,
        baseRefOid: viewState.data.baseRefOid,
        headRefOid: viewState.data.headRefOid,
      }) as PrFileDiffResponse;

      setFileDiffs(prev => ({
        ...prev,
        [filePath]: { loading: false, data: response },
      }));
    } catch (err) {
      setFileDiffs(prev => ({
        ...prev,
        [filePath]: {
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }, [fileDiffs, gateway, prNumber, repoRoot, viewState.data]);

  useEffect(() => {
    if (!selectedFile) return;
    void loadFileDiff(selectedFile);
  }, [loadFileDiff, selectedFile]);

  const pr = viewState.data;
  const filteredFiles = useMemo(() => {
    if (!pr) return [];
    const query = deferredFileQuery.trim().toLowerCase();
    if (!query) return pr.files;
    return pr.files.filter(file => {
      const haystacks = [
        file.path,
        file.previousFilename || '',
        stateLabel(file.status),
      ].join(' ').toLowerCase();
      return haystacks.includes(query);
    });
  }, [deferredFileQuery, pr]);
  const selectedDiff = selectedFile ? fileDiffs[selectedFile] : undefined;
  const checks = useMemo(() => summarizeChecks(pr?.statusCheckRollup), [pr?.statusCheckRollup]);
  const merge = useMemo(() => mergeLabel(pr?.mergeable, pr?.mergeStateStatus), [pr?.mergeStateStatus, pr?.mergeable]);
  const review = useMemo(() => reviewLabel(pr?.reviewDecision), [pr?.reviewDecision]);

  if (viewState.loading && !pr) return <LoadingShell />;

  const primaryError = errorState(viewState.flags);
  if (primaryError && !pr) {
    return (
      <EmptyPanel
        title={primaryError.title}
        detail={primaryError.detail}
        onRetry={() => void loadAll()}
        actionHref={primaryError.link}
        actionLabel={primaryError.linkLabel}
      />
    );
  }

  if (viewState.error && !pr) {
    return <EmptyPanel title="Could not load pull request" detail={viewState.error} onRetry={() => void loadAll()} />;
  }

  if (!pr) {
    return <EmptyPanel title="Pull request unavailable" detail="The PR metadata did not load." onRetry={() => void loadAll()} />;
  }

  const timeline = [
    {
      id: 'opened',
      kind: 'comment' as const,
      author: pr.author?.login || 'unknown',
      body: '',
      createdAt: pr.createdAt,
      reviewState: 'OPENED',
    },
    ...timelineState.data,
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-start gap-4 px-6 py-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-secondary/35">
              <GitPullRequest className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pull Request</span>
                <Badge variant="outline" className={cn('text-[10px]', toneClasses(pr.isDraft ? 'muted' : pr.state === 'OPEN' ? 'success' : 'warning'))}>
                  {pr.isDraft ? 'Draft' : stateLabel(pr.state)}
                </Badge>
              </div>
              <h1 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight text-foreground">
                {pr.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>#{pr.number}</span>
                <span>{pr.author?.login || 'unknown'}</span>
                <span>updated {timeAgo(pr.updatedAt)}</span>
                <span className="font-mono">{pr.headRefName} → {pr.baseRefName}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <MetricPill className="border-success/20 bg-success/10 text-success">+{pr.additions}</MetricPill>
                <MetricPill className="border-destructive/20 bg-destructive/10 text-destructive">-{pr.deletions}</MetricPill>
                <MetricPill className="border-border/60 bg-secondary/35 text-muted-foreground">
                  <FileCode className="size-3" />
                  {pr.changedFiles} {pr.changedFiles === 1 ? 'file' : 'files'}
                </MetricPill>
                <MetricPill className={toneClasses(checks.tone)}>
                  {checks.tone === 'success' ? <Check className="size-3" /> : checks.tone === 'danger' ? <X className="size-3" /> : <Clock className="size-3" />}
                  {checks.label}
                </MetricPill>
                <MetricPill className={toneClasses(review.tone)}>
                  <MessageSquare className="size-3" />
                  {review.label}
                </MetricPill>
                <MetricPill className={toneClasses(merge.tone)}>
                  <GitMerge className="size-3" />
                  {merge.label}
                </MetricPill>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="xs" onClick={() => void loadAll()}>
              <RefreshCw className={cn('size-3', viewState.loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button asChild variant="ghost" size="xs">
              <a href={pr.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3" />
                GitHub
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={mode} onValueChange={(value) => setMode(value as 'overview' | 'files')} className="flex-1 min-h-0 gap-0">
        <div className="border-b border-border/60 px-4">
          <TabsList variant="line" className="h-10 gap-1 bg-transparent p-0">
            <TabsTrigger value="overview" className="h-10 rounded-none px-3 text-[11px]">Overview</TabsTrigger>
            <TabsTrigger value="files" className="h-10 rounded-none px-3 text-[11px]">Files Changed ({pr.files.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 flex-1 min-h-0">
          <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_19rem]">
            <ScrollArea className="min-h-0">
              <div className="mx-auto w-full max-w-4xl px-6 py-6">
                <section className="pb-6">
                  <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Description</div>
                  {pr.body ? (
                    <div className="markdown-viewer !mx-0 !max-w-none !p-0 text-[12px]">
                      <Markdown remarkPlugins={[remarkGfm]}>{pr.body}</Markdown>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-5 text-[12px] text-muted-foreground">
                      No description provided.
                    </div>
                  )}
                </section>

                <section className="border-t border-border/60 pt-6">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Timeline</div>
                    {timelineState.loading ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
                  </div>
                  <div className="space-y-0">
                    {timeline.map((item, index) => {
                      const reviewState = item.reviewState ? stateLabel(item.reviewState) : null;
                      const reviewTone = checkStateTone(item.reviewState);
                      const hasBody = item.body.trim().length > 0;

                      return (
                        <div
                          key={`${item.id}-${index}`}
                          className="grid gap-3 border-t border-border/50 py-4 first:border-t-0 first:pt-0 md:grid-cols-[8.5rem_minmax(0,1fr)]"
                        >
                          <div className="space-y-1 text-[11px] text-muted-foreground">
                            <div className="font-medium text-foreground/80">{item.author}</div>
                            <div>{timeAgo(item.createdAt)}</div>
                          </div>
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                              {reviewState ? (
                                <Badge variant="outline" className={cn('text-[10px]', toneClasses(reviewTone))}>
                                  {reviewState}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  {item.kind === 'reviewComment' ? 'Inline comment' : 'Comment'}
                                </Badge>
                              )}
                              {item.path ? (
                                <span className="rounded-full border border-border/60 bg-secondary/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  {item.path}{item.line ? `:${item.line}` : ''}
                                </span>
                              ) : null}
                              {item.authorAssociation ? (
                                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                                  {item.authorAssociation.toLowerCase()}
                                </span>
                              ) : null}
                              {item.url ? (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  <ExternalLink className="size-3" />
                                  Open
                                </a>
                              ) : null}
                            </div>
                            {hasBody ? (
                              <div className="markdown-viewer !mx-0 !max-w-none !p-0 text-[12px]">
                                <Markdown remarkPlugins={[remarkGfm]}>{item.body}</Markdown>
                              </div>
                            ) : (
                              <div className="text-[12px] text-muted-foreground">
                                {item.reviewState === 'OPENED' ? 'Opened this pull request.' : 'No comment body.'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!timelineState.loading && timeline.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-5 text-[12px] text-muted-foreground">
                        No comments or reviews yet.
                      </div>
                    ) : null}
                    {timelineState.error ? (
                      <div className="rounded-xl border border-dashed border-destructive/30 bg-destructive/5 px-4 py-5 text-[12px] text-muted-foreground">
                        Could not load timeline: {timelineState.error}
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            </ScrollArea>

            <div className="hidden min-h-0 border-l border-border/60 bg-secondary/10 xl:block">
              <ScrollArea className="h-full">
                <div className="space-y-5 px-4 py-5">
                  <RailSection title="Checks">
                    <div className={cn('rounded-xl border px-3 py-3 text-[12px]', toneClasses(checks.tone))}>
                      {checks.label}
                    </div>
                    {checks.details.slice(0, 6).map((check) => (
                      <a
                        key={`${check.label}-${check.state}`}
                        href={check.url || '#'}
                        target={check.url ? '_blank' : undefined}
                        rel={check.url ? 'noreferrer' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors',
                          check.url ? 'hover:bg-secondary/60' : 'cursor-default',
                        )}
                      >
                        <span className={cn('size-2 rounded-full', checkStateTone(check.state) === 'success' ? 'bg-success' : checkStateTone(check.state) === 'danger' ? 'bg-destructive' : checkStateTone(check.state) === 'warning' ? 'bg-warning' : 'bg-muted-foreground/40')} />
                        <span className="min-w-0 flex-1 truncate">{check.label}</span>
                        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{stateLabel(check.state)}</span>
                      </a>
                    ))}
                  </RailSection>

                  <RailSection title="Branches">
                    <div className="space-y-2 text-[11px]">
                      <div className="rounded-xl border border-border/60 bg-card/50 px-3 py-3">
                        <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                          <GitBranch className="size-3" />
                          Head
                        </div>
                        <div className="font-mono text-foreground">{pr.headRefName}</div>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-card/50 px-3 py-3">
                        <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                          <GitBranch className="size-3" />
                          Base
                        </div>
                        <div className="font-mono text-foreground">{pr.baseRefName}</div>
                      </div>
                    </div>
                  </RailSection>

                  <RailSection title="Signals">
                    <div className="space-y-2 text-[11px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Review</span>
                        <Badge variant="outline" className={cn('text-[10px]', toneClasses(review.tone))}>{review.label}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Merge</span>
                        <Badge variant="outline" className={cn('text-[10px]', toneClasses(merge.tone))}>{merge.label}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Created</span>
                        <span>{formatDateTime(pr.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Updated</span>
                        <span>{formatDateTime(pr.updatedAt)}</span>
                      </div>
                    </div>
                  </RailSection>

                  <RailSection title="Labels">
                    {pr.labels && pr.labels.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {pr.labels.map((label) => (
                          <Badge key={label.name} variant="outline" className="text-[10px]">
                            {label.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">No labels</div>
                    )}
                  </RailSection>
                </div>
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="files" className="mt-0 flex-1 min-h-0">
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col border-b border-border/60 bg-secondary/10 lg:border-b-0 lg:border-r">
              <div className="border-b border-border/60 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Changed Files</div>
                  <div className="text-[11px] text-muted-foreground">{filteredFiles.length}/{pr.files.length}</div>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={fileQuery}
                    onChange={(e) => setFileQuery(e.target.value)}
                    placeholder="Filter files"
                    className="h-8 pl-8 text-[12px]"
                  />
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="px-2 py-2">
                  {filteredFiles.map((file) => {
                    const total = file.additions + file.deletions;
                    const addPct = total > 0 ? Math.round((file.additions / total) * 100) : 0;
                    const isSelected = file.path === selectedFile;
                    return (
                      <button
                        key={file.path}
                        className={cn(
                          'mb-1 w-full rounded-xl border px-3 py-2 text-left transition-colors',
                          isSelected
                            ? 'border-primary/40 bg-primary/10 shadow-sm'
                            : 'border-transparent hover:border-border/60 hover:bg-secondary/50',
                        )}
                        onClick={() => setSelectedFile(file.path)}
                      >
                        <div className="flex items-start gap-2">
                          <span className={cn(
                            'mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border text-[10px] font-semibold',
                            toneClasses(
                              file.status === 'added'
                                ? 'success'
                                : file.status === 'removed'
                                  ? 'danger'
                                  : file.status === 'renamed'
                                    ? 'warning'
                                    : 'muted',
                            ),
                          )}>
                            {fileStatusShort(file.status)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium text-foreground">{file.path}</div>
                            {file.previousFilename ? (
                              <div className="truncate text-[10px] text-muted-foreground">
                                from {file.previousFilename}
                              </div>
                            ) : null}
                            <div className="mt-2 flex items-center gap-2 text-[10px]">
                              <span className="text-success">+{file.additions}</span>
                              <span className="text-destructive">-{file.deletions}</span>
                              {file.binary ? <span className="text-muted-foreground">binary</span> : null}
                              <span className="ml-auto text-muted-foreground">{stateLabel(file.status)}</span>
                            </div>
                            <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-destructive/20">
                              <div className="bg-success h-full" style={{ width: `${addPct}%` }} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredFiles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-5 text-[12px] text-muted-foreground">
                      No files match that filter.
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </div>

            <div className="min-h-0">
              {!selectedFile ? (
                <EmptyPanel title="Select a file" detail="Choose a changed file to inspect its diff." />
              ) : selectedDiff?.loading ? (
                <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading diff for {selectedFile}
                </div>
              ) : selectedDiff?.error ? (
                <EmptyPanel title="Could not load diff" detail={selectedDiff.error} onRetry={() => {
                  setFileDiffs(prev => {
                    const next = { ...prev };
                    delete next[selectedFile];
                    return next;
                  });
                  void loadFileDiff(selectedFile);
                }} />
              ) : selectedDiff?.data ? (
                selectedDiff.data.ghMissing || selectedDiff.data.ghAuthError || selectedDiff.data.networkError || selectedDiff.data.notFound ? (
                  <EmptyPanel
                    title={errorState(selectedDiff.data)?.title || 'Diff unavailable'}
                    detail={errorState(selectedDiff.data)?.detail || 'The diff could not be loaded.'}
                    onRetry={() => {
                      setFileDiffs(prev => {
                        const next = { ...prev };
                        delete next[selectedFile];
                        return next;
                      });
                      void loadFileDiff(selectedFile);
                    }}
                    actionHref={errorState(selectedDiff.data)?.link}
                    actionLabel={errorState(selectedDiff.data)?.linkLabel}
                  />
                ) : selectedDiff.data.isBinary ? (
                  <EmptyPanel title="Binary file" detail="This file is binary, so the text diff viewer is not used here." />
                ) : selectedDiff.data.isTooLarge ? (
                  <EmptyPanel title="Diff too large" detail="This file is large enough that rendering a full text diff would be noisy and slow." />
                ) : (
                  <DiffViewer
                    oldContent={selectedDiff.data.oldContent || ''}
                    newContent={selectedDiff.data.newContent || ''}
                    filePath={selectedFile}
                  />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                  Select a file to inspect its diff.
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
