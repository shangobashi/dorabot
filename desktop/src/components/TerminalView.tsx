import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { Palette } from '../lib/palettes';
import { getPalette } from '../lib/palettes';

type Props = {
  shellId: string;
  cwd?: string;
  rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  onShellEvent?: (listener: (data: { shellId: string; type: string; data?: string }) => void) => () => void;
  palette?: Palette;
  focused?: boolean;
};

function getTerminalTheme(palette?: Palette) {
  if (palette) {
    return getPalette(palette).terminal;
  }
  const storedPalette = localStorage.getItem('palette') as Palette | null;
  const p = storedPalette || (localStorage.getItem('theme') === 'light' ? 'default-light' : 'default-dark');
  return getPalette(p).terminal;
}

export function TerminalView({ shellId, cwd, rpc, onShellEvent, palette, focused }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connected, setConnected] = useState(false);
  const spawnedRef = useRef(false);

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: getTerminalTheme(palette),
      allowProposedApi: true,
      scrollback: 5000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    // Fit after a frame so container has dimensions
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch { /* ignore */ }
      });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getTerminalTheme(palette);
    }
  }, [palette]);

  // Re-fit when tab becomes focused (visibility: hidden -> visible won't trigger ResizeObserver)
  useEffect(() => {
    if (focused && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
      });
    }
  }, [focused]);

  // Spawn shell and wire up I/O
  useEffect(() => {
    const term = terminalRef.current;
    if (!term || spawnedRef.current) return;
    spawnedRef.current = true;

    // Spawn shell process (may reclaim an orphaned shell with scrollback)
    const cols = term.cols;
    const rows = term.rows;
    rpc('shell.spawn', { shellId, cols, rows, ...(cwd ? { cwd } : {}) }).then((res) => {
      const result = res as { spawned?: boolean; reclaimed?: boolean; scrollback?: string } | undefined;
      // Restore scrollback buffer if shell was reclaimed (e.g. after page refresh)
      if (result?.reclaimed && result?.scrollback) {
        try {
          const bytes = Uint8Array.from(atob(result.scrollback), c => c.charCodeAt(0));
          term.write(bytes);
        } catch (err) {
          console.error('[TerminalView] failed to restore scrollback:', err);
        }
      }
      setConnected(true);
    }).catch((err) => {
      term.writeln(`\r\n\x1b[31mFailed to spawn shell: ${err}\x1b[0m\r\n`);
    });

    // Send input to shell
    const disposable = term.onData((data) => {
      rpc('shell.write', { shellId, data }).catch(() => {});
    });

    // Send resize events
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      rpc('shell.resize', { shellId, cols, rows }).catch(() => {});
    });

    return () => {
      disposable.dispose();
      resizeDisposable.dispose();
    };
  }, [shellId, rpc]);

  // Receive output from shell
  useEffect(() => {
    if (!onShellEvent) return;

    const unsubscribe = onShellEvent((event) => {
      if (event.shellId !== shellId) return;
      const term = terminalRef.current;
      if (!term) return;

      if (event.type === 'data' && event.data) {
        term.write(event.data);
      } else if (event.type === 'exit') {
        term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m');
        setConnected(false);
      }
    });

    return unsubscribe;
  }, [shellId, onShellEvent]);

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: getTerminalTheme(palette).background }}>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 p-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
