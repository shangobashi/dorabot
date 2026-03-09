import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

type GlobalSearchProps = {
  open: boolean;
  onClose: () => void;
  rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  viewRoot: string;
  onOpenFile: (filePath: string) => void;
};

type SearchMatch = { path: string; line: number; text: string };
type GroupedResult = { path: string; relPath: string; matches: { line: number; text: string }[] };

export function GlobalSearch({ open, onClose, rpc, viewRoot, onOpenFile }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Flatten results for keyboard navigation
  const flatItems = useMemo(() => {
    const items: { path: string; line: number; text: string; groupIdx: number; matchIdx: number }[] = [];
    results.forEach((group, gi) => {
      group.matches.forEach((m, mi) => {
        items.push({ path: group.path, line: m.line, text: m.text, groupIdx: gi, matchIdx: mi });
      });
    });
    return items;
  }, [results]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await rpc('search.ripgrep', { path: viewRoot, query: q.trim() }) as { results: SearchMatch[] };
      // Group by file
      const map = new Map<string, GroupedResult>();
      for (const m of res.results) {
        let group = map.get(m.path);
        if (!group) {
          const rel = m.path.startsWith(viewRoot) ? m.path.slice(viewRoot.length + 1) : m.path;
          group = { path: m.path, relPath: rel, matches: [] };
          map.set(m.path, group);
        }
        group.matches.push({ line: m.line, text: m.text });
      }
      setResults(Array.from(map.values()));
      setSelected(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [rpc, viewRoot]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open, doSearch]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const openResult = useCallback((item?: { path: string }) => {
    if (!item) return;
    onOpenFile(item.path);
    onClose();
  }, [onOpenFile, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/35 backdrop-blur-[1px] flex items-start justify-center pt-20 px-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-border bg-popover shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="border-b border-border px-3 py-2 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(v => Math.min(v + 1, flatItems.length - 1)); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(v => Math.max(v - 1, 0)); return; }
              if (e.key === 'Enter') { e.preventDefault(); openResult(flatItems[selected]); return; }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
            }}
            placeholder="Search in files..."
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
            autoFocus
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {loading && <div className="px-3 py-4 text-[11px] text-muted-foreground">Searching...</div>}
          {!loading && query.trim() && results.length === 0 && (
            <div className="px-3 py-4 text-[11px] text-muted-foreground">No results</div>
          )}
          {!loading && (() => {
            let flatIdx = 0;
            return results.map(group => (
              <div key={group.path}>
                <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground bg-muted/30 sticky top-0 flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 shrink-0" />
                  <span className="truncate">{group.relPath}</span>
                  <span className="ml-auto text-muted-foreground/50">{group.matches.length}</span>
                </div>
                {group.matches.map(m => {
                  const idx = flatIdx++;
                  return (
                    <button
                      key={`${group.path}:${m.line}:${idx}`}
                      className={cn(
                        'w-full text-left px-3 py-1 transition-colors flex items-baseline gap-2',
                        idx === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/50',
                      )}
                      onMouseEnter={() => setSelected(idx)}
                      onClick={() => openResult({ path: group.path })}
                    >
                      <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 w-8 text-right">{m.line}</span>
                      <span className="text-[12px] truncate">{m.text}</span>
                    </button>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      </div>
    </div>,
    document.body,
  );
}
