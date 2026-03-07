import { useState, useEffect } from 'react';
import { ShikiHighlighter } from 'react-shiki/core';
import type { HighlighterCore } from 'shiki/core';
import { useTheme } from '../../hooks/useTheme';
import { getHighlighter, getLanguage } from '../../lib/highlighter';

type Props = {
  content: string;
  filePath: string;
};

export function CodeViewer({ content, filePath }: Props) {
  const language = getLanguage(filePath);
  const { theme } = useTheme();
  const [hl, setHl] = useState<HighlighterCore | null>(null);

  useEffect(() => {
    getHighlighter().then(setHl);
  }, []);

  if (!hl) {
    return (
      <pre className="p-4 text-[13px] leading-[1.5] h-full overflow-auto text-foreground">
        <code>{content}</code>
      </pre>
    );
  }

  return (
    <div className="code-viewer">
      <ShikiHighlighter
        language={language}
        theme={theme === 'dark' ? 'vitesse-dark' : 'vitesse-light'}
        highlighter={hl}
        showLineNumbers
        showLanguage={false}
        addDefaultStyles={false}
        style={{
          margin: 0,
          padding: '1rem',
          fontSize: '13px',
          lineHeight: '1.5',
          height: '100%',
          overflow: 'auto',
        }}
      >
        {content}
      </ShikiHighlighter>
    </div>
  );
}
