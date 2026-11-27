import React, { useState } from "react";
import {
  FileText,
  ExternalLink,
  Download,
  Eye,
  EyeOff,
  Maximize2,
  X,
  Paperclip
} from "lucide-react";
import {
  isImageAttachment,
  isPdfAttachment,
  isDocxAttachment,
  formatFileSize
} from "../utils/mediaUtils";

/**
 * Clean viewer for Teacher Reference Materials & Worksheets (Images, PDF, DOCX).
 * Includes image click-to-zoom lightbox, inline collapsible PDF preview iframe,
 * and one-click DOCX download.
 */
export default function ReferenceFilesViewer({
  files = [],
  title = "Reference Materials & Worksheets",
  compact = false
}) {
  const [expandedPdfKeys, setExpandedPdfKeys] = useState({});
  const [zoomedImage, setZoomedImage] = useState(null);

  if (!Array.isArray(files) || files.length === 0) return null;

  const togglePdfPreview = (key) => {
    setExpandedPdfKeys((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <>
      <div
        className={`${
          compact
            ? "p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200/80 dark:border-indigo-800/50 space-y-2.5"
            : "p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-3"
        }`}
      >
        <div className="flex items-center space-x-2">
          <Paperclip className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            {title} ({files.length})
          </span>
        </div>

        <div className="space-y-2.5">
          {files.map((fileMeta, idx) => {
            if (!fileMeta?.url) return null;
            const fileKey = fileMeta.key || fileMeta.url || String(idx);
            const isImg = isImageAttachment(fileMeta);
            const isPdf = isPdfAttachment(fileMeta);
            const isDocx = isDocxAttachment(fileMeta);
            const isPdfOpen = Boolean(expandedPdfKeys[fileKey]);
            const downloadHref = fileMeta.url.includes("?")
              ? `${fileMeta.url}&download=1`
              : `${fileMeta.url}?download=1`;

            if (isImg) {
              return (
                <div
                  key={fileKey}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        setZoomedImage({
                          url: fileMeta.url,
                          name: fileMeta.name || `Reference Image ${idx + 1}`
                        })
                      }
                      className="relative group shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in"
                      title="Click to zoom image"
                    >
                      <img
                        src={fileMeta.url}
                        alt={fileMeta.name || "Reference Image"}
                        className="h-14 w-14 object-cover"
                      />
                      <span className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="h-3.5 w-3.5 text-white" />
                      </span>
                    </button>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {fileMeta.name || `Reference Image ${idx + 1}`}
                      </p>
                      <p className="text-[10.5px] text-slate-400">
                        Reference Image{fileMeta.size ? ` • ${formatFileSize(fileMeta.size)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setZoomedImage({
                          url: fileMeta.url,
                          name: fileMeta.name || `Reference Image ${idx + 1}`
                        })
                      }
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      <Eye className="h-3 w-3" />
                      <span>View</span>
                    </button>
                    <a
                      href={downloadHref}
                      download={fileMeta.name || true}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      <span>Save</span>
                    </a>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={fileKey}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                <div className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isPdf
                          ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                          : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {fileMeta.name || (isPdf ? "Worksheet.pdf" : "Worksheet.docx")}
                      </p>
                      <p className="text-[10.5px] text-slate-400">
                        {isPdf ? "PDF Worksheet / Handout" : isDocx ? "Word Document (.docx)" : "Reference File"}
                        {fileMeta.size ? ` • ${formatFileSize(fileMeta.size)}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {isPdf && (
                      <button
                        type="button"
                        onClick={() => togglePdfPreview(fileKey)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/60 text-[11px] font-bold hover:bg-indigo-100 transition-colors cursor-pointer"
                      >
                        {isPdfOpen ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        <span>{isPdfOpen ? "Hide PDF" : "Preview PDF"}</span>
                      </button>
                    )}

                    {!isDocx && (
                      <a
                        href={fileMeta.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Open Tab</span>
                      </a>
                    )}

                    <a
                      href={downloadHref}
                      download={fileMeta.name || true}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-200/70 dark:border-brand-800/60 text-[11px] font-bold hover:bg-brand-100 transition-colors"
                    >
                      <Download className="h-3 w-3" />
                      <span>{isDocx ? "Download .docx" : "Download"}</span>
                    </a>
                  </div>
                </div>

                {isPdf && isPdfOpen && (
                  <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 p-2">
                    <iframe
                      src={fileMeta.url}
                      title={fileMeta.name || "PDF Preview"}
                      className="w-full h-[420px] rounded-lg bg-white border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl w-full flex flex-col items-center space-y-2"
          >
            <img
              src={zoomedImage.url}
              alt={zoomedImage.name}
              className="max-h-[82vh] w-auto rounded-2xl shadow-2xl border border-slate-700 object-contain"
            />
            <div className="flex items-center space-x-3 text-xs text-slate-200 bg-slate-900/90 px-4 py-2 rounded-xl border border-slate-700">
              <span className="font-bold truncate max-w-xs">{zoomedImage.name}</span>
              <a
                href={
                  zoomedImage.url.includes("?")
                    ? `${zoomedImage.url}&download=1`
                    : `${zoomedImage.url}?download=1`
                }
                download={zoomedImage.name || true}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-400 font-bold hover:underline inline-flex items-center space-x-1"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </a>
            </div>
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute -top-2 right-0 p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 border border-slate-700 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
