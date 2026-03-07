import { useState } from 'react';
import type { ProgressItem } from '../hooks/useGateway';
import { Check, ChevronDown, ChevronRight, Circle, Loader2 } from 'lucide-react';

export function Progress({ items }: { items: ProgressItem[] }) {
  if (items.length === 0) return null;

  const done = items.filter(i => i.status === 'completed').length;
  const total = items.length;
  const allDone = done === total;
  const inProgress = items.find(i => i.status === 'in_progress');

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border bg-card shrink-0">
      <button
        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {allDone ? (
          <Check className="w-3 h-3 text-success shrink-0" />
        ) : inProgress ? (
          <Loader2 className="w-3 h-3 text-primary shrink-0 animate-spin" />
        ) : (
          <Circle className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        <span className="text-[11px] text-muted-foreground truncate flex-1 text-left">
          {allDone ? 'Done' : inProgress ? inProgress.activeForm : `${done}/${total}`}
        </span>
        <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{done}/{total}</span>
        {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-0.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              {item.status === 'completed' ? (
                <Check className="w-3 h-3 text-success shrink-0" />
              ) : item.status === 'in_progress' ? (
                <Loader2 className="w-3 h-3 text-primary shrink-0 animate-spin" />
              ) : (
                <Circle className="w-3 h-3 text-muted-foreground shrink-0" />
              )}
              <span className={item.status === 'completed' ? 'text-muted-foreground/60' : 'text-foreground'}>
                {item.status === 'in_progress' ? item.activeForm : item.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
