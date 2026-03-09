import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { File } from 'lucide-react';
import { cn } from '@/lib/utils';

type QuickOpenProps = {
  open: boolean;
  onClose: () => void;
  rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  viewRoot: string;
  onOpenFile: (filePath: string) => void;
};

type FileEntry = { name: string; path: string; rel: string };

const MAX_FILES = 10000;
const MAX_RESULTS = 20;

function fuzzyScore(query: string, target: string): number {
  const lower = target.toLowerCase();
  const name = lower.split('/').pop() || lower;
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let nameMatch = false;
  const nameStart = lower.length - name.length;

  for (let i = 0; i < lower.length && qi < query.length; i++) {
    if (lower[i] === query[qi]) {
      qi++;
      consecutive++;
      score += consecutive;
      if (i >= nameStart) nameMatch = true;
      if (i === 0 || lower[i - 1] === '/' || lower[i - 1] === '-' || lower[i - 1] === '_' || lower[i - 1] === '.') {
        score += 5; // start of word bonus
      }
    } else {
      consecutive = 0;
    }
  }
  if (qi < query.length) return -Infinity;
  if (nameMatch) score += 10;
  return score;
}

export function QuickOpen({ open, onClose, rpc, viewRoot, onOpenFile }: QuickOpenProps) {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cacheRef = useRef<{ root: string; files: FileEntry[] } | null>(null);

  const fetchFiles = useCallback(async (root: string) => {
    if (cacheRef.current?.root === root) {
      setFiles(cacheRef.current.files);
      return;
    }
    setLoading(true);
    try {
      const result: FileEntry[] = [];
      const walk = async (dir: string) => {
        if (result.length >= MAX_FILES) return;
        const res = await rpc('fs.list', { path: dir }) as { entries: { name: string; path: string; isDirectory: boolean }[] };
        for (const e of res.entries) {
          if (result.length >= MAX_FILES) break;
          if (e.isDirectory) {
            if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__' || e.name === 'dist' || e.name === 'build') continue;
            await walk(e.path);
          } else {
            result.push({ name: e.name, path: e.path, rel: e.path.slice(root.length + 1) });
          }
        }
      };
      await walk(root);
      result.sort((a, b) => a.rel.localeCompare(b.rel));
      cacheRef.current = { root, files: result };
      setFiles(result);
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    if (open && viewRoot) {
      setQuery('');
      setSelected(0);
      void fetchFiles(viewRoot);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, viewRoot, fetchFiles]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files.slice(0, MAX_RESULTS);
    return files
      .map(f => ({ f, score: fuzzyScore(q, f.rel) }))
      .filter(x => Number.isFinite(x.score) && x.score > -Infinity)
      .sort((a, b) => b.score - a.score || a.f.rel.length - b.f.rel.length)
      .slice(0, MAX_RESULTS)
      .map(x => x.f);
  }, [files, query]);

  useEffect(() => {
    setSelected(prev => Math.min(prev, Math.max(results.length - 1, 0)));
  }, [results]);

  const openFile = useCallback((file?: FileEntry) => {
    if (!file) return;
    onOpenFile(file.path);
    onClose();
  }, [onOpenFile, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/35 backdrop-blur-[1px] flex items-start justify-center pt-20 px-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-popover shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="border-b border-border px-3 py-2">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(v => Math.min(v + 1, results.length - 1)); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(v => Math.max(v - 1, 0)); return; }
              if (e.key === 'Enter') { e.preventDefault(); openFile(results[selected]); return; }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
            }}
            placeholder="Go to file..."
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
            autoFocus
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto p-1">
          {loading && <div className="px-2 py-4 text-[11px] text-muted-foreground">Indexing files...</div>}
          {!loading && results.length === 0 && (
            <div className="px-2 py-4 text-[11px] text-muted-foreground">{query.trim() ? 'No matches' : 'No files indexed'}</div>
          )}
          {!loading && results.map((file, idx) => (
            <button
              key={file.path}
              className={cn(
                'flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md transition-colors',
                idx === selected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-secondary/50',
              )}
              onMouseEnter={() => setSelected(idx)}
              onClick={() => openFile(file)}
            >
              <File className="w-3.5 h-3.5 shrink-0 opacity-50" />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] truncate">{file.name}</div>
                <div className="text-[10px] truncate opacity-60">{file.rel}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
