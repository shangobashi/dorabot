import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

type Props = {
  filePath: string;
  rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;

export function PDFViewer({ filePath, rpc }: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);
  const [fitToWidth, setFitToWidth] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Load PDF data
  useEffect(() => {
    setLoading(true);
    setError(null);

    rpc('fs.readBinary', { path: filePath })
      .then((res) => {
        const result = res as { content: string };
        const binaryString = atob(result.content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        setPdfData(bytes);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [filePath, rpc]);

  // Measure container width for fit-to-width
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const measure = () => {
      const width = container.clientWidth;
      if (width > 0) setContainerWidth(width);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // IntersectionObserver to track visible page
  useEffect(() => {
    if (numPages === 0) return;

    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let mostVisiblePage = currentPage;
        for (const entry of entries) {
          const pageNum = Number(entry.target.getAttribute('data-page'));
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisiblePage = pageNum;
          }
        }
        if (maxRatio > 0) {
          setCurrentPage(mostVisiblePage);
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      }
    );

    observerRef.current = observer;

    for (const [, el] of pageRefs.current) {
      observer.observe(el);
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        handleFitToWidth();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleZoomIn = useCallback(() => {
    setFitToWidth(false);
    setZoomFactor((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 10) / 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitToWidth(false);
    setZoomFactor((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 10) / 10));
  }, []);

  const handleFitToWidth = useCallback(() => {
    setFitToWidth(true);
    setZoomFactor(1.0);
  }, []);

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n);
    setCurrentPage(1);
  }

  const setPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    if (el) {
      pageRefs.current.set(pageNum, el);
      observerRef.current?.observe(el);
    } else {
      const existing = pageRefs.current.get(pageNum);
      if (existing) observerRef.current?.unobserve(existing);
      pageRefs.current.delete(pageNum);
    }
  }, []);

  // Compute page width: fit-to-width uses container width minus padding, otherwise scale from a base
  const pageWidth = useMemo(() => {
    if (fitToWidth && containerWidth > 0) {
      // 48px padding (24 each side)
      return (containerWidth - 48) * zoomFactor;
    }
    // Fallback: use 800 as base width
    return 800 * zoomFactor;
  }, [fitToWidth, containerWidth, zoomFactor]);

  const zoomPercentage = fitToWidth
    ? `${Math.round(zoomFactor * 100)}%`
    : `${Math.round(zoomFactor * 100)}%`;

  const file = useMemo(() => (pdfData ? { data: pdfData } : null), [pdfData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading PDF...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm">
        Failed to load PDF: {error}
      </div>
    );
  }

  if (!file) return null;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/50 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={!fitToWidth && zoomFactor <= MIN_ZOOM}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom out (Cmd+-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums min-w-[3rem] text-center select-none">
            {zoomPercentage}
          </span>
          <button
            onClick={handleZoomIn}
            disabled={!fitToWidth && zoomFactor >= MAX_ZOOM}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom in (Cmd++)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={handleFitToWidth}
            className={`p-1 rounded transition-colors ${
              fitToWidth
                ? 'text-foreground bg-secondary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            }`}
            title="Fit to width (Cmd+0)"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-xs text-muted-foreground select-none tabular-nums">
          {numPages > 0 ? `Page ${currentPage} of ${numPages}` : ''}
        </div>
      </div>

      {/* Scrollable page container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-muted/30"
      >
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(err) => console.error('pdf load error:', err)}
          loading={
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Loading document...
            </div>
          }
        >
          <div className="flex flex-col items-center gap-4 py-6 px-6">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => setPageRef(pageNum, el)}
                data-page={pageNum}
                className="shadow-md bg-white dark:bg-zinc-900 rounded-sm"
              >
                <Page
                  pageNumber={pageNum}
                  width={pageWidth > 0 ? pageWidth : undefined}
                  loading={
                    <div
                      className="flex items-center justify-center text-muted-foreground text-xs"
                      style={{ width: pageWidth > 0 ? pageWidth : 600, height: 800 }}
                    >
                      Loading page {pageNum}...
                    </div>
                  }
                />
              </div>
            ))}
          </div>
        </Document>
      </div>
    </div>
  );
}
