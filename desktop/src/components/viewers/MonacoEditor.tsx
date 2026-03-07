import { useRef, useCallback, useEffect } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import { useTheme } from '../../hooks/useTheme';

// Configure Monaco to load from node_modules (works offline in Electron)
loader.config({ paths: { vs: new URL('monaco-editor/min/vs', import.meta.url).href } });

const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  css: 'css', html: 'html', json: 'json', xml: 'xml',
  yaml: 'yaml', yml: 'yaml', toml: 'ini',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
  scala: 'scala', sql: 'sql', r: 'r', lua: 'lua',
  md: 'markdown', mdx: 'markdown',
  txt: 'plaintext', log: 'plaintext',
  env: 'ini', gitignore: 'plaintext', dockerignore: 'plaintext',
  Makefile: 'makefile', Dockerfile: 'dockerfile',
};

function getMonacoLanguage(filePath: string): string {
  const name = filePath.split('/').pop() || '';
  // Handle extensionless files like Makefile, Dockerfile
  if (EXT_TO_LANG[name]) return EXT_TO_LANG[name];
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANG[ext] || 'plaintext';
}

type Props = {
  content: string;
  filePath: string;
  readOnly?: boolean;
  onSave?: (content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
};

export function MonacoEditor({ content, filePath, readOnly = false, onSave, onDirtyChange }: Props) {
  const { theme } = useTheme();
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const originalContentRef = useRef(content);
  const onSaveRef = useRef(onSave);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onSaveRef.current = onSave;
  onDirtyChangeRef.current = onDirtyChange;

  // Update original content ref when content prop changes (file watcher reload)
  useEffect(() => {
    originalContentRef.current = content;
    const editor = editorRef.current;
    if (editor) {
      const currentValue = editor.getValue();
      if (currentValue !== content) {
        // Only update if not dirty, to avoid overwriting user edits
        const isDirty = currentValue !== content;
        if (!isDirty || readOnly) {
          editor.setValue(content);
        }
      }
    }
  }, [content, readOnly]);

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;

    // Cmd+S save
    editor.addCommand(
      // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS
      2048 | 49, // CtrlCmd = 2048, KeyS = 49
      () => {
        const value = editor.getValue();
        onSaveRef.current?.(value);
      }
    );

    // Track dirty state
    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      const isDirty = value !== originalContentRef.current;
      onDirtyChangeRef.current?.(isDirty);
    });

    // Focus the editor
    editor.focus();
  }, []);

  const language = getMonacoLanguage(filePath);

  return (
    <Editor
      defaultValue={content}
      language={language}
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      onMount={handleMount}
      options={{
        readOnly,
        fontSize: 13,
        lineHeight: 1.5,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        automaticLayout: true,
        padding: { top: 8, bottom: 8 },
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
        renderLineHighlight: readOnly ? 'none' : 'line',
        cursorStyle: readOnly ? 'line-thin' : 'line',
        lineNumbers: 'on',
        folding: true,
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        tabSize: 2,
        insertSpaces: true,
        smoothScrolling: true,
        contextmenu: true,
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        parameterHints: { enabled: false },
        hover: { enabled: false },
      }}
      loading={
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Loading editor...
        </div>
      }
    />
  );
}
