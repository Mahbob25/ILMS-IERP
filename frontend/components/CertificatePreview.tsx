"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { X, Printer, Loader2, FileDown } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface CertificateData {
  id: string;
  certificate_number: string;
  course_name: string;
  student_name: string;
  issued_at: string;
  final_score?: number | null;
  grade_label?: string | null;
  student_id_no?: string | null;
  student_code?: string | null;
  course_code?: string | null;
  duration_text?: string | null;
  total_hours?: string | null;
}

interface CertificatePreviewProps {
  certId: string;
  onClose: () => void;
}

export default function CertificatePreview({ certId, onClose }: CertificatePreviewProps) {
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const certRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAr = locale === "ar";

  const t = {
    print: isAr ? "طباعة / PDF" : "Print / PDF",
    downloadPdf: isAr ? "تحميل PDF" : "Download PDF",
    close: isAr ? "إغلاق" : "Close",
    loading: isAr ? "جاري تحميل الشهادة..." : "Loading certificate...",
    error: isAr ? "فشل تحميل الشهادة" : "Failed to load certificate",
    institution: "Languages Computer Science and Studies Institute",
    certificateTitle: isAr ? "شهادة إتمام" : "Certificate of Completion",
    presentedTo: isAr ? "يُمنح لـ" : "Presented to",
    courseLabel: isAr ? "المقرر" : "Course",
    resultLabel: isAr ? "النتيجة النهائية" : "Final Result",
    gradeLabel: isAr ? "التقدير" : "Grade",
    studentIdLabel: isAr ? "رقم الطالب" : "Student ID",
    certNumberLabel: isAr ? "رقم الشهادة" : "Certificate No.",
    issueDateLabel: isAr ? "تاريخ الإصدار" : "Issue Date",
    durationLabel: isAr ? "المدة" : "Duration",
    hoursLabel: isAr ? "عدد الساعات" : "Total Hours",
    sealText: isAr ? "معهد LCS" : "LCS Institute",
    footerText: isAr
      ? "معهد اللغات وعلوم الحاسب والدراسات"
      : "Languages Computer Science and Studies Institute",
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .get(`/academic/certificates/${certId}`)
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
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
  }, [certId]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  const handlePrint = () => {
    if (!data) return;
    const content = certRef.current?.innerHTML || "";
    const fontFamily = isAr ? "'Cairo', 'Arial', sans-serif" : "'Inter', 'Arial', sans-serif";

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="${isAr ? "rtl" : "ltr"}">
      <head>
        <meta charset="utf-8">
        <title>${data.certificate_number}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: ${fontFamily};
            background: #f0f2f5;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
          }
          .certificate {
            width: 800px;
            max-width: 100%;
            background: #fff;
            border: 3px solid #1e293b;
            padding: 50px 50px;
            text-align: center;
            position: relative;
          }
          .certificate::before {
            content: '';
            position: absolute;
            top: 8px; left: 8px; right: 8px; bottom: 8px;
            border: 1px solid #cbd5e1;
            pointer-events: none;
          }
          .institution {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 3px;
            color: #64748b;
            margin-bottom: 30px;
          }
          .title {
            font-size: 32px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 24px;
            text-transform: uppercase;
            letter-spacing: 2px;
          }
          .subtitle { font-size: 14px; color: #64748b; margin-bottom: 8px; }
          .student-name {
            font-size: 28px;
            font-weight: 700;
            color: #0f172a;
            margin: 24px 0;
            padding: 12px 0;
            border-top: 2px solid #e2e8f0;
            border-bottom: 2px solid #e2e8f0;
          }
          .course-name { font-size: 18px; color: #334155; margin-bottom: 30px; }
          .details {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 30px 50px;
            margin-top: 30px;
            font-size: 12px;
            color: #64748b;
          }
          .details div { min-width: 140px; }
          .details span { display: block; }
          .details strong {
            display: block;
            color: #1e293b;
            font-size: 13px;
            margin-top: 3px;
          }
          .grade-row {
            margin-top: 24px;
            display: flex;
            justify-content: center;
            gap: 40px;
            font-size: 14px;
          }
          .grade-item {
            padding: 8px 24px;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
          }
          .grade-item .label {
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .grade-item .value {
            font-size: 18px;
            font-weight: 700;
            color: #0f172a;
          }
          .seal {
            margin-top: 40px;
            width: 70px; height: 70px;
            border: 2px solid #1e293b;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            color: #1e293b;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; }
          @media print {
            body { background: white; padding: 0; }
            .certificate { box-shadow: none; max-width: 100%; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <div class="certificate">${content}</div>
        <script>window.print();window.close();</script>
      </body>
      </html>
    `);

    printWindow.document.close();
  };

  const handleDownloadPdf = async () => {
    if (!certRef.current || !data) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "visible";

    try {
      const canvas = await html2canvas(certRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${data.certificate_number}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      document.body.style.overflow = originalOverflow;
    }
  };

  const hasGrade = data?.final_score != null && data?.grade_label;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h3 className="text-lg font-bold text-slate-900">
            {loading ? t.loading : error ? t.error : data?.certificate_number}
          </h3>
          <div className="flex items-center gap-2">
            {data && (
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

        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="animate-spin text-slate-400" size={32} />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-64 text-red-500 text-sm">{error}</div>
          )}
          {data && (
            <div
              ref={certRef}
              dir={isAr ? "rtl" : "ltr"}
              style={{
                fontFamily: isAr ? "'Cairo', 'Arial', sans-serif" : "'Inter', 'Arial', sans-serif",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: "800px",
                  margin: "0 auto",
                  background: "#fff",
                  border: "3px solid #1e293b",
                  padding: "50px 50px",
                  textAlign: "center",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 8, left: 8, right: 8, bottom: 8,
                    border: "1px solid #cbd5e1",
                    pointerEvents: "none",
                  }}
                />
                <div style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 3, color: "#64748b", marginBottom: 30 }}>
                  {t.institution}
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: "#1e293b", marginBottom: 24, textTransform: "uppercase", letterSpacing: 2 }}>
                  {t.certificateTitle}
                </div>
                <div style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>{t.presentedTo}</div>
                <div
                  style={{
                    fontSize: 28, fontWeight: 700, color: "#0f172a",
                    margin: "24px 0", padding: "12px 0",
                    borderTop: "2px solid #e2e8f0",
                    borderBottom: "2px solid #e2e8f0",
                  }}
                >
                  {data.student_name}
                </div>
                <div style={{ fontSize: 18, color: "#334155", marginBottom: 30 }}>
                  {t.courseLabel}: <strong>{data.course_name}</strong>
                </div>

                {hasGrade && (
                  <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 40, fontSize: 14 }}>
                    <div style={{ padding: "8px 24px", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                        {t.resultLabel}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                        {data.final_score?.toFixed(1)}%
                      </div>
                    </div>
                    <div style={{ padding: "8px 24px", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
                        {t.gradeLabel}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                        {data.grade_label}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "30px 50px", marginTop: 30, fontSize: 12, color: "#64748b" }}>
                  <div>
                    <span>{t.studentIdLabel}</span>
                    <strong>{data.student_id_no || data.student_code || "—"}</strong>
                  </div>
                  <div>
                    <span>{t.certNumberLabel}</span>
                    <strong>{data.certificate_number}</strong>
                  </div>
                  <div>
                    <span>{t.issueDateLabel}</span>
                    <strong>{formatDate(data.issued_at)}</strong>
                  </div>
                  <div>
                    <span>{t.durationLabel}</span>
                    <strong>{data.duration_text || "—"}</strong>
                  </div>
                  <div>
                    <span>{t.hoursLabel}</span>
                    <strong>{data.total_hours || "—"}</strong>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 40, width: 70, height: 70,
                    border: "2px solid #1e293b", borderRadius: "50%",
                    display: "inline-flex", alignItems: "center",
                    justifyContent: "center", fontSize: 9,
                    color: "#1e293b", textTransform: "uppercase", letterSpacing: 1,
                  }}
                >
                  {t.sealText}
                </div>
                <div style={{ marginTop: 32, fontSize: 10, color: "#94a3b8" }}>
                  {t.footerText}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
