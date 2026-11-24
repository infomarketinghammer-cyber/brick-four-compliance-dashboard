import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, X, AlertCircle } from 'lucide-react';
import type { StoredDocument } from '../services/api';

interface DocumentViewerModalProps {
  /** Header text for the document */
  fileName: string;
  subtitle?: string;
  /** Loads the file from the server (access-controlled) */
  load: () => Promise<StoredDocument>;
  /** Extra details shown under the preview (notes, status, ...) */
  details?: React.ReactNode;
  onClose: () => void;
}

const IMAGE_TYPES = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'IMAGE'];

/** Converts a data: URL to a Blob so browsers can preview it (Chrome blocks data: URLs in frames) */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload = ''] = dataUrl.split(',');
  const mime = header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  if (header.includes(';base64')) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/** Triggers a browser download of a stored file */
export function downloadDataUrl(dataUrl: string, fileName: string) {
  const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'document';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ fileName, subtitle, load, details, onClose }) => {
  const [doc, setDoc] = useState<StoredDocument | null>(null);
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    let createdUrl = '';
    setIsLoading(true);
    setError('');
    load()
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        if (d.fileData) {
          createdUrl = URL.createObjectURL(dataUrlToBlob(d.fileData));
          setBlobUrl(createdUrl);
        }
      })
      .catch((err: any) => !cancelled && setError(err?.message || 'Could not load the document.'))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // load is recreated on every render by callers; the document identity is the file name + open instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mime = doc?.fileData.match(/^data:([^;,]+)/)?.[1] || '';
  const type = (doc?.fileType || fileName.split('.').pop() || '').toUpperCase();
  const isImage = mime.startsWith('image/') || IMAGE_TYPES.includes(type);
  const isPdf = mime === 'application/pdf' || type === 'PDF';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col p-6 gap-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">{fileName}</h3>
              {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-[260px] overflow-auto border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 text-xs text-slate-500">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Loading document…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 text-xs text-rose-700 p-6 text-center">
              <AlertCircle className="w-6 h-6" />
              {error}
            </div>
          ) : !doc?.fileData ? (
            <div className="text-center text-xs text-slate-500 p-6 space-y-1">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">No uploaded file is stored for this record.</p>
              <p>It was created before document storage was enabled (sample data).</p>
            </div>
          ) : isImage ? (
            <img src={blobUrl} alt={fileName} className="max-h-[65vh] max-w-full object-contain" />
          ) : isPdf ? (
            <iframe src={blobUrl} title={fileName} className="w-full h-[65vh] rounded-xl bg-white" />
          ) : (
            <div className="text-center text-xs text-slate-500 p-6 space-y-2">
              <FileText className="w-12 h-12 text-indigo-300 mx-auto" />
              <p className="font-semibold text-slate-700">{type || 'This'} files cannot be previewed in the browser.</p>
              <p>Use Download to open it in Word, Excel or another app.</p>
            </div>
          )}
        </div>

        {details && <div className="text-xs text-slate-600">{details}</div>}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 text-xs"
          >
            Close
          </button>
          {blobUrl && (isPdf || isImage) && (
            <a
              href={blobUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-semibold text-xs flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </a>
          )}
          <button
            disabled={!doc?.fileData}
            onClick={() => doc?.fileData && downloadDataUrl(doc.fileData, doc.fileName || fileName)}
            className="px-4 py-2 bg-brand-gradient hover:opacity-90 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>
    </div>
  );
};
