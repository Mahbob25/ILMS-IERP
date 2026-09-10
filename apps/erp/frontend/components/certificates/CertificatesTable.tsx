"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "@/lib/api";
import { sanitizeInput, escapeLikeWildcards } from "@/lib/utils/input";
import CertificatePreview from "@/components/CertificatePreview";
import EmptyState from "@/components/EmptyState";
import { Loader2, Search, Trash2, Eye, FileDown, AlertCircle, Square, CheckSquare } from "lucide-react";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import TableContainer from "@/components/ui/TableContainer";
import BulkActionBar from "@/components/BulkActionBar";
import Select from "@/components/ui/Select";

export interface Certificate {
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
  duration_text?: string | null;
  total_hours?: string | null;
}

interface SectionOption {
  section_id: string;
  course_name: string;
  course_code: string | null;
  start_date: string | null;
  certificate_count: number;
}

interface CertificatesTableProps {
  isRtl: boolean;
  locale: string;
  canDelete: boolean;
  sectionId?: string;
  showFilters?: boolean;
  showCourseColumn?: boolean;
  refreshKey?: number;
}

const LIMIT = 15;

export default function CertificatesTable({
  isRtl,
  locale,
  canDelete,
  sectionId,
  showFilters = true,
  showCourseColumn = true,
  refreshKey = 0,
}: CertificatesTableProps) {
  const t = {
    ar: {
      certificateNumber: "رقم الشهادة",
      student: "الطالب",
      course: "المقرر",
      issuedAt: "تاريخ الإصدار",
      actions: "الإجراءات",
      loading: "جاري التحميل...",
      empty: "لا توجد شهادات بعد",
      noResults: "لا توجد نتائج مطابقة للفلاتر المحددة",
      fetchError: "فشل تحميل الشهادات",
      search: "بحث باسم الطالب أو المقرر أو رقم الشهادة...",
      allSections: "كل الشعب",
      section: "الشعبة",
      filterDateFrom: "من تاريخ",
      filterDateTo: "إلى تاريخ",
      clearFilters: "مسح الفلاتر",
      preview: "عرض",
      download: "تحميل PDF",
      delete: "حذف",
      confirmDelete: "هل أنت متأكد من حذف هذه الشهادة؟",
      confirmTitle: "تأكيد الحذف",
      deleted: "تم حذف الشهادة بنجاح",
      showing: "عرض",
      of: "من",
      prev: "السابق",
      next: "التالي",
      close: "إغلاق",
      studentCode: "رمز الطالب",
      finalScore: "الدرجة النهائية",
      grade: "التقدير",
      selectAll: "تحديد الكل",
      deselect: "إلغاء التحديد",
      deleteAll: "حذف المحدد",
      downloadAll: "تحميل المحدد",
      confirmBulkDelete: "هل أنت متأكد من حذف {count} شهادة؟",
      bulkDeleted: "تم حذف {count} شهادة بنجاح",
      bulkDeleteErrors: "فشل حذف {count} من {total} شهادة",
      bulkDeleteFailed: "فشل حذف الشهادات المحددة",
      deleteFailed: "فشل الحذف",
      downloadFailed: "فشل التحميل",
      batchDownloadFailed: "فشل تحميل الملفات",
      noCertificatesLoaded: "تعذر تحميل الشهادات",
    },
    en: {
      certificateNumber: "Certificate No.",
      student: "Student",
      course: "Course",
      issuedAt: "Issue Date",
      actions: "Actions",
      loading: "Loading...",
      empty: "No certificates yet",
      noResults: "No certificates match the selected filters",
      fetchError: "Failed to fetch certificates",
      search: "Search by student, course, or certificate number...",
      allSections: "All sections",
      section: "Section",
      filterDateFrom: "From date",
      filterDateTo: "To date",
      clearFilters: "Clear filters",
      preview: "Preview",
      download: "Download PDF",
      delete: "Delete",
      confirmDelete: "Are you sure you want to delete this certificate?",
      confirmTitle: "Confirm Deletion",
      deleted: "Certificate deleted successfully",
      showing: "Showing",
      of: "of",
      prev: "Previous",
      next: "Next",
      close: "Close",
      studentCode: "Student Code",
      finalScore: "Final Score",
      grade: "Grade",
      selectAll: "Select All",
      deselect: "Deselect",
      deleteAll: "Delete Selected",
      downloadAll: "Download Selected",
      confirmBulkDelete: "Delete {count} certificates?",
      bulkDeleted: "{count} certificate(s) deleted",
      bulkDeleteErrors: "Failed to delete {count} of {total} certificates",
      bulkDeleteFailed: "Bulk delete failed",
      deleteFailed: "Delete failed",
      downloadFailed: "Download failed",
      batchDownloadFailed: "Batch download failed",
      noCertificatesLoaded: "No certificates could be loaded",
    },
  }[locale === "en" ? "en" : "ar"];

  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewCert, setPreviewCert] = useState<Certificate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Certificate | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Held in refs so the fetch effect never depends on filter values: a dep on
  // `search` would fire a request per keystroke and double-fire against the debounce.
  const filtersRef = useRef({ searchTerm: "", section: "", from: "", to: "" });
  const pageRef = useRef(1);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupsRequested = useRef(false);
  const requestSeq = useRef(0);

  const pageIds = certificates.map((c) => c.id);
  const bulk = useBulkSelection(pageIds);

  const load = useCallback(
    async (pageNum: number) => {
      const filters = filtersRef.current;
      const scopedSection = sectionId || filters.section || "";
      const seq = ++requestSeq.current;
      setMessage(null);
      setFetchError(null);
      setBusy(true);
      try {
        const params = new URLSearchParams({
          search: escapeLikeWildcards(sanitizeInput(filters.searchTerm)),
          skip: String((pageNum - 1) * LIMIT),
          limit: String(LIMIT),
          sort_by: "issued_at",
          sort_order: "desc",
        });
        if (scopedSection) params.set("section_id", scopedSection);
        if (filters.from) params.set("date_from", filters.from);
        if (filters.to) params.set("date_to", filters.to);

        const res = await apiClient.get<{ items: Certificate[]; total: number }>(
          `/academic/certificates?${params.toString()}`
        );
        if (seq !== requestSeq.current) return;
        setCertificates(res.data.items);
        setTotalCount(res.data.total);
      } catch {
        if (seq !== requestSeq.current) return;
        setCertificates([]);
        setTotalCount(0);
        setFetchError(t.fetchError);
      } finally {
        if (seq === requestSeq.current) {
          setBusy(false);
          setInitialLoading(false);
        }
      }
    },
    [sectionId, t.fetchError]
  );

  // Only trigger for mount / explicit refresh / scope change. Filter and search
  // changes call load() imperatively instead.
  useEffect(() => {
    pageRef.current = 1;
    setPage(1);
    void load(1);
  }, [load, refreshKey, sectionId]);

  // Section options are needed only by the global page; scoped instances must not
  // issue this request at all.
  useEffect(() => {
    if (!showFilters || sectionId || lookupsRequested.current) return;
    lookupsRequested.current = true;
    let cancelled = false;
    apiClient
      .get<SectionOption[]>("/academic/certificates/sections")
      .then((res) => {
        if (!cancelled) setSectionOptions(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showFilters, sectionId]);

  useEffect(
    () => () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    },
    []
  );

  const goToPage = (pageNum: number) => {
    pageRef.current = pageNum;
    setPage(pageNum);
    void load(pageNum);
  };

  const resetToFirstPage = () => {
    pageRef.current = 1;
    setPage(1);
    void load(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    filtersRef.current.searchTerm = value;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(resetToFirstPage, 400);
  };

  const applyFilter = (patch: Partial<typeof filtersRef.current>) => {
    filtersRef.current = { ...filtersRef.current, ...patch };
    resetToFirstPage();
  };

  const handleSectionFilterChange = (value: string) => {
    setSectionFilter(value);
    applyFilter({ section: value });
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    applyFilter({ from: value });
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    applyFilter({ to: value });
  };

  const clearFilters = () => {
    setSearch("");
    setSectionFilter("");
    setDateFrom("");
    setDateTo("");
    filtersRef.current = { searchTerm: "", section: "", from: "", to: "" };
    resetToFirstPage();
  };

  const handleDelete = async (id: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiClient.delete(`/academic/certificates/${id}`);
      setDeleteTarget(null);
      setMessage({ type: "success", text: t.deleted });
      void load(pageRef.current);
    } catch {
      setDeleteTarget(null);
      setMessage({ type: "error", text: t.deleteFailed });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (bulkSubmitting || bulk.selectedCount === 0) return;
    setBulkSubmitting(true);
    try {
      const ids = Array.from(bulk.selectedIds);
      const res = await apiClient.delete<{ deleted_count: number; errors: string[] }>(
        "/academic/certificates/batch",
        { data: { cert_ids: ids } }
      );
      bulk.reset();
      setBulkDeleteConfirm(false);
      if (res.data.errors.length > 0) {
        setBulkMessage({
          type: "error",
          text: t.bulkDeleteErrors
            .replace("{count}", String(res.data.errors.length))
            .replace("{total}", String(ids.length)),
        });
      } else {
        setBulkMessage({
          type: "success",
          text: t.bulkDeleted.replace("{count}", String(res.data.deleted_count)),
        });
      }
      void load(pageRef.current);
    } catch {
      setBulkDeleteConfirm(false);
      setBulkMessage({ type: "error", text: t.bulkDeleteFailed });
    } finally {
      setBulkSubmitting(false);
    }
  };

  const renderPdf = async (html: string, filename: string) => {
    const container = document.createElement("div");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "297mm";
    container.style.zIndex = "-1";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);

    try {
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 300));

      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 0,
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, width: 297, height: 210 },
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        })
        .from(container)
        .save();
    } finally {
      document.body.removeChild(container);
    }
  };

  const fetchPreviewHtml = async (certId: string) => {
    const res = await apiClient.get<string>(`/academic/certificates/${certId}/preview`, {
      responseType: "text",
    });
    return res.data;
  };

  const handleBulkDownloadPdf = async () => {
    const ids = Array.from(bulk.selectedIds);
    setBulkSubmitting(true);
    try {
      const htmlParts: string[] = [];
      for (const certId of ids) {
        if (!certificates.some((c) => c.id === certId)) continue;
        try {
          htmlParts.push(await fetchPreviewHtml(certId));
        } catch {
          // skip failed previews
        }
      }
      if (htmlParts.length === 0) {
        setBulkMessage({ type: "error", text: t.noCertificatesLoaded });
        return;
      }
      const combinedHtml = htmlParts.join('<div style="page-break-after: always;"></div>');
      await renderPdf(combinedHtml, "certificates-batch.pdf");
      bulk.reset();
    } catch {
      setBulkMessage({ type: "error", text: t.batchDownloadFailed });
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleDownloadPdf = async (cert: Certificate) => {
    try {
      await renderPdf(await fetchPreviewHtml(cert.id), `${cert.certificate_number}.pdf`);
    } catch {
      setMessage({ type: "error", text: t.downloadFailed });
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

  const sectionSelectOptions = [
    { value: "", label: t.allSections },
    ...sectionOptions.map((s) => ({
      value: s.section_id,
      label: s.start_date ? `${s.course_name} · ${s.start_date}` : s.course_name,
      badge: {
        label: String(s.certificate_count),
        className: "bg-slate-100 text-slate-600 border-slate-200",
      },
    })),
  ];

  const hasActiveFilters = Boolean(search || sectionFilter || dateFrom || dateTo);
  const totalPages = Math.ceil(totalCount / LIMIT);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-sm min-w-[12rem]">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t.search}
              className="input-field ps-9"
            />
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          </div>

          {!sectionId && (
            <Select
              value={sectionFilter}
              onChange={handleSectionFilterChange}
              options={sectionSelectOptions}
              placeholder={t.allSections}
              isRtl={isRtl}
              className="w-56"
            />
          )}

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateFromChange(e.target.value)}
            className="input-field text-xs w-36"
            title={t.filterDateFrom}
            aria-label={t.filterDateFrom}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            className="input-field text-xs w-36"
            title={t.filterDateTo}
            aria-label={t.filterDateTo}
          />

          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700">
              {t.clearFilters}
            </button>
          )}
        </div>
      )}

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
          <button onClick={() => setMessage(null)} className="ms-2 float-end">
            &times;
          </button>
        </div>
      )}

      {fetchError && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
          <button onClick={() => setFetchError(null)} className="ms-auto text-red-400 hover:text-red-600">
            &times;
          </button>
        </div>
      )}

      {certificates.length === 0 ? (
        <EmptyState title={hasActiveFilters ? t.noResults : t.empty} message="" />
      ) : (
        <div className={`card overflow-hidden transition-opacity ${busy ? "opacity-60" : ""}`}>
          <BulkActionBar
            selectedCount={bulk.selectedCount}
            onDeselectAll={bulk.reset}
            actions={[
              {
                label: t.downloadAll,
                icon: <FileDown size={14} />,
                onClick: handleBulkDownloadPdf,
                disabled: bulkSubmitting,
              },
              ...(canDelete
                ? [
                    {
                      label: t.deleteAll,
                      icon: <Trash2 size={14} />,
                      variant: "danger" as const,
                      onClick: () => setBulkDeleteConfirm(true),
                      disabled: bulkSubmitting,
                    },
                  ]
                : []),
            ]}
            isRtl={isRtl}
            message={bulkMessage}
            onDismissMessage={() => setBulkMessage(null)}
          />
          <TableContainer>
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8">
                    <button
                      onClick={() => bulk.toggleAll(pageIds)}
                      className="text-slate-400 hover:text-brand-600"
                      title={t.selectAll}
                    >
                      {bulk.isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </th>
                  <th>{t.certificateNumber}</th>
                  <th>{t.student}</th>
                  <th className="hidden md:table-cell">{t.studentCode}</th>
                  {showCourseColumn && <th>{t.course}</th>}
                  <th className="hidden lg:table-cell">{t.finalScore}</th>
                  <th className="hidden lg:table-cell">{t.grade}</th>
                  <th>{t.issuedAt}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((cert) => (
                  <tr key={cert.id}>
                    <td className="w-8">
                      <button
                        onClick={() => bulk.toggle(cert.id)}
                        className="text-slate-400 hover:text-brand-600"
                      >
                        {bulk.isSelected(cert.id) ? (
                          <CheckSquare size={16} className="text-brand-600" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </td>
                    <td className="font-mono text-xs font-medium text-slate-900">
                      {cert.certificate_number}
                    </td>
                    <td className="font-medium text-slate-900">{cert.student_name}</td>
                    <td className="hidden md:table-cell text-slate-600">{cert.student_code || "—"}</td>
                    {showCourseColumn && <td className="text-slate-600">{cert.course_name}</td>}
                    <td className="hidden lg:table-cell text-slate-700 font-semibold">
                      {cert.final_score != null ? `${cert.final_score}%` : "—"}
                    </td>
                    <td className="hidden lg:table-cell">
                      {cert.grade_label ? (
                        <span className="badge badge-success">{cert.grade_label}</span>
                      ) : (
                        "—"
                      )}
                    </td>
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
          </TableContainer>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
            <span>
              {t.showing} {Math.min((page - 1) * LIMIT + 1, totalCount)}–{Math.min(page * LIMIT, totalCount)}{" "}
              {t.of} {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                {t.prev}
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
                className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
              >
                {t.next}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewCert && (
        <CertificatePreview certId={previewCert.id} onClose={() => setPreviewCert(null)} />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 mb-2">{t.confirmDelete}</h3>
            <p className="text-sm text-slate-600 mb-4">
              {deleteTarget.certificate_number} — {deleteTarget.student_name}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary">
                {t.close}
              </button>
              <button
                onClick={() => handleDelete(deleteTarget.id)}
                disabled={submitting}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setBulkDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 mb-2">{t.confirmTitle}</h3>
            <p className="text-sm text-slate-600 mb-4">
              {t.confirmBulkDelete.replace("{count}", String(bulk.selectedCount))}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setBulkDeleteConfirm(false)} className="btn-secondary">
                {t.close}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkSubmitting}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
