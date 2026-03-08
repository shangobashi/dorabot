import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';

type Props = {
  filePath: string;
  rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
};

type SheetData = {
  name: string;
  data: (string | number)[][];
};

export function ExcelViewer({ filePath, rpc }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);

    rpc('fs.readBinary', { path: filePath })
      .then(async (res) => {
        const result = res as { content: string };
        const base64 = result.content;

        // Convert base64 to ArrayBuffer
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes.buffer as ArrayBuffer);

        const sheetData: SheetData[] = [];
        workbook.eachSheet((worksheet) => {
          const data: (string | number)[][] = [];
          worksheet.eachRow({ includeEmpty: false }, (row) => {
            const rowValues = row.values as (string | number | null)[];
            // ExcelJS row.values is 1-indexed (index 0 is empty), skip it
            data.push(rowValues.slice(1).map(v => v == null ? '' : v));
          });
          sheetData.push({ name: worksheet.name, data });
        });

        setSheets(sheetData);
        setActiveSheet(0);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [filePath, rpc]);

  if (loading) {
    return <div className="excel-viewer-loading">loading excel file...</div>;
  }

  if (error) {
    return (
      <div className="excel-viewer-error">
        <p>failed to load excel file</p>
        <p style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>{error}</p>
      </div>
    );
  }

  if (sheets.length === 0) {
    return <div className="excel-viewer-error">no sheets found in file</div>;
  }

  const currentSheet = sheets[activeSheet];

  return (
    <div className="excel-viewer-container">
      {sheets.length > 1 && (
        <div className="excel-sheet-tabs">
          {sheets.map((sheet, i) => (
            <button
              key={i}
              className={`excel-sheet-tab ${i === activeSheet ? 'active' : ''}`}
              onClick={() => setActiveSheet(i)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
      <div className="excel-table-wrapper">
        <table className="excel-table">
          <tbody>
            {currentSheet.data.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
