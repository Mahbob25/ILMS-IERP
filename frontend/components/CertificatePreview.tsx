"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { X, Printer, Loader2, FileDown } from "lucide-react";
import { generatePdfFromHtml } from "@/lib/generatePdfFromHtml";

interface CertificateData {
  id: string;
  certificate_number: string;
}

interface CertificatePreviewProps {
  certId: string;
  onClose: () => void;
}

export default function CertificatePreview({ certId, onClose }: CertificatePreviewProps) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [data, setData] = useState<CertificateData | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAr = locale === "ar";

  const t = {
    print: isAr ? "طباعة / PDF" : "Print / PDF",
    downloadPdf: isAr ? "تحميل PDF" : "Download PDF",
    close: isAr ? "إغلاق" : "Close",
    loading: isAr ? "جاري تحميل الشهادة..." : "Loading certificate...",
    error: isAr ? "فشل تحميل الشهادة" : "Failed to load certificate",
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiClient.get(`/academic/certificates/${certId}`),
      apiClient.get(`/academic/certificates/${certId}/preview?locale=${locale}`, { responseType: "text" }),
    ])
      .then(([jsonRes, htmlRes]) => {
        if (!cancelled) {
          setData(jsonRes.data);
          setHtmlContent(htmlRes.data as string);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t.error);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [certId, locale]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const handlePrint = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  };

  const handleDownloadPdf = async () => {
    if (!htmlContent || !data) return;

    try {
      await generatePdfFromHtml(htmlContent, {
        filename: `${data.certificate_number}.pdf`,
        width: 297,
        height: 210,
        orientation: "l",
        format: "a4",
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
    }
  };

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentDocument) {
      iframe.contentDocument.documentElement.style.margin = "0";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col"
        style={{ maxHeight: "95vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h3 className="text-lg font-bold text-slate-900">
            {loading ? t.loading : error ? t.error : data?.certificate_number}
          </h3>
          <div className="flex items-center gap-2">
            {data && htmlContent && (
              <>
                <button onClick={handlePrint} className="btn-primary flex items-center gap-2 text-sm">
                  <Printer size={16} />
                  <span>{t.print}</span>
                </button>
                <button onClick={handleDownloadPdf} className="btn-secondary flex items-center gap-2 text-sm">
                  <FileDown size={16} />
                  <span>{t.downloadPdf}</span>
                </button>
              </>
            )}
            <button onClick={onClose} className="btn-icon text-slate-500">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-slate-100">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="animate-spin text-slate-400" size={32} />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-64 text-red-500 text-sm">{error}</div>
          )}
          {htmlContent && (
            <iframe
              ref={iframeRef}
              srcDoc={htmlContent}
              className="w-full border-0 shadow-lg rounded-lg"
              style={{ height: "70vh", background: "#fff" }}
              title="Certificate Preview"
              onLoad={handleIframeLoad}
            />
          )}
        </div>
      </div>
    </div>
  );
}
