"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import RefreshButton from "@/components/RefreshButton";
import CertificatePreview from "@/components/CertificatePreview";
import { Loader2, Search, Trash2, Eye, FileDown } from "lucide-react";

interface Certificate {
  id: string;
  student_id: string;
  section_id: string;
  certificate_number: string;
  course_name: string;
  student_name: string;
  issued_at: string;
  final_score: number | null;
  grade_label: string | null;
  student_id_no: string | null;
  student_code: string | null;
  course_code: string | null;
}

export default function CertificatesPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const t = {
    ar: {
      title: "الشهادات",
      subtitle: "إدارة شهادات إتمام المقررات",
      certificateNumber: "رقم الشهادة",
      student: "الطالب",
      course: "المقرر",
      issuedAt: "تاريخ الإصدار",
      actions: "الإجراءات",
      loading: "جاري التحميل...",
      empty: "لا توجد شهادات بعد",
      search: "بحث باسم الطالب أو المقرر أو رقم الشهادة...",
      preview: "عرض",
      download: "تحميل PDF",
      delete: "حذف",
      confirmDelete: "هل أنت متأكد من حذف هذه الشهادة؟",
      deleted: "تم حذف الشهادة بنجاح",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      refresh: "تحديث",
      close: "إغلاق",
      studentCode: "رمز الطالب",
      courseCode: "رمز المقرر",
      finalScore: "الدرجة النهائية",
      grade: "التقدير",
    },
    en: {
      title: "Certificates",
      subtitle: "Manage course completion certificates",
      certificateNumber: "Certificate No.",
      student: "Student",
      course: "Course",
      issuedAt: "Issue Date",
      actions: "Actions",
      loading: "Loading...",
      empty: "No certificates yet",
      search: "Search by student, course, or certificate number...",
      preview: "Preview",
      download: "Download PDF",
      delete: "Delete",
      confirmDelete: "Are you sure you want to delete this certificate?",
      deleted: "Certificate deleted successfully",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      refresh: "Refresh",
      close: "Close",
      studentCode: "Student Code",
      courseCode: "Course Code",
      finalScore: "Final Score",
      grade: "Grade",
    },
  }[locale === "en" ? "en" : "ar"];

  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Certificate | null>(null);
  const limit = 15;

  const fetchCertificates = useCallback(async (searchTerm = "", pageNum = 1) => {
    setMessage(null);
    try {
      const skip = (pageNum - 1) * limit;
      let url = `/academic/certificates?search=${encodeURIComponent(searchTerm)}&skip=${skip}&limit=${limit}&sort_by=issued_at&sort_order=desc`;
      const res = await apiClient.get<{ items: Certificate[]; total: number }>(url);
      setCertificates(res.data.items);
      setTotalCount(res.data.total);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, []);

  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => {
      setPage(1);
      fetchCertificates(value, 1);
    }, 400));
  };

  useEffect(() => {
    setLoading(true);
    fetchCertificates();
    return () => { if (searchTimeout) clearTimeout(searchTimeout); };
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/academic/certificates/${id}`);
      setDeleteTarget(null);
      setMessage({ type: "success", text: t.deleted });
      fetchCertificates(search, page);
    } catch {
      setDeleteTarget(null);
      setMessage({ type: "error", text: "Delete failed" });
    }
  };

  const handleDownloadPdf = async (cert: Certificate) => {
    try {
      const res = await apiClient.get(`/academic/certificates/${cert.id}/preview`, {
        responseType: "text",
      });
      const htmlContent = res.data;

      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "210mm";
      container.style.zIndex = "-1";
      container.style.opacity = "0";
      container.style.pointerEvents = "none";
      document.body.appendChild(container);

      await document.fonts.ready;
      await new Promise(r => setTimeout(r, 300));

      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `${cert.certificate_number}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(container)
        .save();

      document.body.removeChild(container);
    } catch {
      setMessage({ type: "error", text: "Download failed" });
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const canDelete = user?.is_superadmin || user?.role?.name === "manager";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => fetchCertificates(search, page)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={t.search}
            className="input-field ps-9"
          />
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        </div>
        {search && (
          <button onClick={() => { setSearch(""); setPage(1); fetchCertificates("", 1); }} className="text-xs text-slate-500 hover:text-slate-700">
            {t.close}
          </button>
        )}
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          message.type === "success"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ms-2 float-end">&times;</button>
        </div>
      )}

      {certificates.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t.empty}</div>
      ) : (
        <div className="card overflow-hidden">
              <table className="data-table">
            <thead>
              <tr>
                <th>{t.certificateNumber}</th>
                <th>{t.student}</th>
                <th className="hidden md:table-cell">{t.studentCode}</th>
                <th>{t.course}</th>
                <th className="hidden lg:table-cell">{t.finalScore}</th>
                <th className="hidden lg:table-cell">{t.grade}</th>
                <th>{t.issuedAt}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((cert) => (
                <tr key={cert.id}>
                  <td className="font-mono text-xs font-medium text-slate-900">{cert.certificate_number}</td>
                  <td className="font-medium text-slate-900">{cert.student_name}</td>
                  <td className="hidden md:table-cell text-slate-600">{cert.student_code || "—"}</td>
                  <td className="text-slate-600">{cert.course_name}</td>
                  <td className="hidden lg:table-cell text-slate-700 font-semibold">{cert.final_score != null ? `${cert.final_score}%` : "—"}</td>
                  <td className="hidden lg:table-cell">{cert.grade_label ? <span className="badge badge-success">{cert.grade_label}</span> : "—"}</td>
                  <td className="text-slate-500 text-sm">{formatDate(cert.issued_at)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPreviewCert(cert)}
                        className="btn-icon text-blue-600"
                        title={t.preview}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(cert)}
                        className="btn-icon text-emerald-600"
                        title={t.download}
                      >
                        <FileDown size={14} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(cert)}
                          className="btn-icon text-red-500"
                          title={t.delete}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>{t.showing} {Math.min((page - 1) * limit + 1, totalCount)}–{Math.min(page * limit, totalCount)} {t.of} {totalCount}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => { const p = page - 1; setPage(p); fetchCertificates(search, p); }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >{t.prev}</button>
              <button
                disabled={page >= Math.ceil(totalCount / limit)}
                onClick={() => { const p = page + 1; setPage(p); fetchCertificates(search, p); }}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >{t.next}</button>
            </div>
          </div>
        </div>
      )}

      {previewCert && (
        <CertificatePreview
          certId={previewCert.id}
          onClose={() => setPreviewCert(null)}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{t.confirmDelete}</h3>
            <p className="text-sm text-slate-600 mb-4">
              {deleteTarget.certificate_number} — {deleteTarget.student_name}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary">{t.close}</button>
              <button onClick={() => handleDelete(deleteTarget.id)} className="btn-primary bg-red-600 hover:bg-red-700">{t.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
