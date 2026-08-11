"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Play,
  CheckCircle2,
  UserPlus,
  XCircle,
  Ban,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import SectionStatusBadge from "@/components/sections/SectionStatusBadge";
import CancelSectionModal from "@/components/sections/CancelSectionModal";
import DeactivateSectionModal from "@/components/sections/DeactivateSectionModal";
import CompleteSectionModal from "@/components/sections/CompleteSectionModal";
import ContractStatusBadge from "@/components/sections/ContractStatusBadge";

interface CourseSection {
  id: string;
  course_id: string;
  teacher_id: string;
  capacity: number;
  enrolled_count: number;
  status: string;
  contract_status: string | null;
  contract_compensation_model: string | null;
  teacher_percentage: number | null;
  min_students_required: number | null;
  start_date: string | null;
  end_date: string | null;
  class_time: string | null;
  class_duration_minutes: number | null;
  classroom: string | null;
  price: number | null;
  flags?: Record<string, any>;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
}

interface SectionsTableProps {
  sections: CourseSection[];
  totalCount: number;
  page: number;
  limit: number;
  search: string;
  statusFilter: string;
  getCourseName: (id: string) => string;
  getTeacherName: (id: string) => string;
  canEdit: boolean;
  canDelete: boolean | undefined;
  canActivate: boolean | undefined;
  canRegister: boolean | undefined;
  user: any;
  t: any;
  isRtl: boolean;
  locale: string;
  completingSection: string | null;
  onEdit: (section: CourseSection) => void;
  onDelete: (section: CourseSection) => void;
  onActivate: (sectionId: string) => void;
  onRegister: (sectionId: string) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onActionMessage: (msg: { type: "success" | "error"; text: string } | null) => void;
}

export default function SectionsTable({
  sections,
  totalCount,
  page,
  limit,
  search,
  statusFilter,
  getCourseName,
  getTeacherName,
  canEdit,
  canDelete,
  canActivate,
  canRegister,
  user,
  t,
  isRtl,
  locale,
  completingSection,
  onEdit,
  onDelete,
  onActivate,
  onRegister,
  onPageChange,
  onRefresh,
  onActionMessage,
}: SectionsTableProps) {
  const router = useRouter();

  const [cancelTarget, setCancelTarget] = React.useState<CourseSection | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<CourseSection | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<CourseSection | null>(null);
  const [completeOverride, setCompleteOverride] = React.useState<{ ungraded: any[]; unpaid: any[] }>({
    ungraded: [],
    unpaid: [],
  });

  if (sections.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        {t.empty}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t.course}</th>
            {user?.role?.name !== "teacher" && <th>{t.teacher}</th>}
            <th>{t.status}</th>
            <th>{t.quota}</th>
            <th>{t.contract || "Contract"}</th>
            <th>{t.price}</th>
            <th>{t.schedule}</th>
            <th>{t.actions}</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => {
            const enrolled = section.enrolled_count;
            const minReq = section.min_students_required || 1;
            const quotaMet = enrolled >= minReq;
            return (
              <tr key={section.id}>
                <td className="font-medium text-slate-900">{getCourseName(section.course_id)}</td>
                {user?.role?.name !== "teacher" && <td className="text-slate-600">{getTeacherName(section.teacher_id)}</td>}
                <td>
                  <SectionStatusBadge
                    status={section.status}
                    labels={{ pending: t.pending, active: t.active, completed: t.completed, ready_for_completion: t.ready_for_completion, cancelled: t.cancelled }}
                    overdue={section.flags?.overdue === true}
                    isRtl={isRtl}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-2 w-24">
                      <div
                        className={`h-2 rounded-full transition-all ${quotaMet ? "bg-emerald-500" : "bg-amber-400"}`}
                        style={{ width: `${Math.min(100, (enrolled / minReq) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{enrolled}/{minReq}</span>
                  </div>
                </td>
                <td>
                  {section.teacher_id ? (
                    <ContractStatusBadge
                      status={section.contract_status || ""}
                      isRtl={false}
                      labels={{
                        assigned: t.assigned,
                        active: t.contractActive,
                        grades_submitted: t.contractGraded,
                        settled: t.contractSettled,
                        cancelled: t.contractCancelled,
                        draft: t.contractDraft,
                      }}
                    />
                  ) : "—"}
                </td>
                <td className="text-slate-600">{section.price != null ? `${section.price}` : "—"}</td>
                <td className="text-xs text-slate-500">
                  {section.start_date || section.class_time || section.classroom ? (
                    <span className="space-y-0.5 block">
                      {section.start_date && <span className="block">{section.start_date}{section.end_date ? ` → ${section.end_date}` : ""}</span>}
                      {section.class_time && <span className="block">{section.class_time}{section.class_duration_minutes ? ` (${section.class_duration_minutes}min)` : ""}</span>}
                      {section.classroom && <span className="block">{section.classroom}</span>}
                    </span>
                  ) : "—"}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => router.push(`/${locale}/dashboard/sections/${section.id}`)}
                      className="btn-icon"
                      title="View Details"
                    >
                      <Eye size={14} />
                    </button>
                    {canEdit && section.status === "pending" && (
                      <button onClick={() => onEdit(section)} className="btn-icon" title={t.edit}><Pencil size={14} /></button>
                    )}
                    {canDelete && (
                      <button onClick={() => onDelete(section)} className="btn-icon text-red-500" title={t.delete}><Trash2 size={14} /></button>
                    )}
                    {(user?.is_superadmin || user?.role?.name === "manager") && (section.status === "pending" || section.status === "active") && (
                      <button onClick={() => setCancelTarget(section)} className="btn-icon text-red-500" title={t.cancelSection}><XCircle size={14} /></button>
                    )}
                    {user?.is_superadmin && section.status === "active" && (
                      <button onClick={() => setDeactivateTarget(section)} className="btn-icon text-amber-500" title={t.deactivateSection}><Ban size={14} /></button>
                    )}
                    {canActivate && section.status === "pending" && section.contract_status === "assigned" && (
                      <button
                        onClick={() => onActivate(section.id)}
                        disabled={!quotaMet || section.price == null || !section.teacher_id || !section.start_date || !section.class_time}
                        className={`btn-icon ${quotaMet && section.price != null && section.teacher_id && section.start_date && section.class_time ? "text-emerald-600" : "text-slate-300"}`}
                        title={
                          !quotaMet ? `${t.activate} (${t.quota}: ${section.enrolled_count}/${section.min_students_required || 1})`
                          : section.price == null ? `${t.activate} (${t.errMissingPrice})`
                          : !section.teacher_id ? `${t.activate} (${t.errMissingTeacher})`
                          : !section.start_date ? `${t.activate} (${t.errMissingStartDate})`
                          : !section.class_time ? `${t.activate} (${t.errMissingClassTime})`
                          : t.activate
                        }
                      >
                        <Play size={14} />
                      </button>
                    )}
                    {canActivate && (section.status === "active" || section.status === "ready_for_completion") && (
                      <button
                        onClick={async () => {
                          try {
                            await apiClient.post(`/academic/course-sections/${section.id}/complete`, {});
                            onActionMessage({ type: "success", text: t.completedMsg });
                            onRefresh();
                          } catch (e: unknown) {
                            const err = e as { response?: { data?: { detail?: any } } };
                            const detailRaw = err?.response?.data?.detail;
                            const detail = typeof detailRaw === "string" ? detailRaw : detailRaw?.message || "";
                            if (typeof detail === "string" && (detail.includes("missing") || detail.includes("grades") || detail.includes("payment") || detail.includes("unpaid") || detail.includes("ungraded"))) {
                              setCompleteTarget(section);
                              setCompleteOverride({
                                ungraded: (detailRaw?.ungraded_students || []).map((name: string) => ({ student_name: name })),
                                unpaid: (detailRaw?.unpaid_students || []).map((s: any) => ({ student_name: s.student_name, amount: s.balance })),
                              });
                            } else {
                              onActionMessage({ type: "error", text: detail || t.completionFailed });
                              setTimeout(() => onActionMessage(null), 5000);
                            }
                          }
                        }}
                        className="btn-icon text-emerald-600"
                        title={t.complete}
                      >
                        {completingSection === section.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      </button>
                    )}
                    {canRegister && section.status === "pending" && (
                      <button
                        onClick={() => onRegister(section.id)}
                        className="btn-icon text-indigo-600"
                        title={t.registerStudent}
                      >
                        <UserPlus size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
        <span>{t.showing} {Math.min((page - 1) * limit + 1, totalCount)}–{Math.min(page * limit, totalCount)} {t.of} {totalCount}</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
          >
            {t.prev}
          </button>
          <button
            disabled={page >= Math.ceil(totalCount / limit)}
            onClick={() => onPageChange(page + 1)}
            className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-40 hover:bg-slate-100"
          >
            {t.next}
          </button>
        </div>
      </div>

      <CancelSectionModal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        sectionId={cancelTarget?.id || ""}
        sectionName={cancelTarget ? getCourseName(cancelTarget.course_id) : ""}
        isRtl={isRtl}
        locale={locale}
        onSuccess={() => { onActionMessage({ type: "success", text: t.cancelSuccess }); onRefresh(); }}
      />

      <DeactivateSectionModal
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        sectionId={deactivateTarget?.id || ""}
        sectionName={deactivateTarget ? getCourseName(deactivateTarget.course_id) : ""}
        hasPayments={(deactivateTarget?.enrolled_count || 0) > 0}
        isRtl={isRtl}
        locale={locale}
        onSuccess={() => { onActionMessage({ type: "success", text: t.deactivateSuccess }); onRefresh(); }}
      />

      <CompleteSectionModal
        open={completeTarget !== null}
        onClose={() => { setCompleteTarget(null); setCompleteOverride({ ungraded: [], unpaid: [] }); }}
        sectionId={completeTarget?.id || ""}
        bypassGradeCheck={completeOverride.ungraded.length > 0}
        bypassPaymentCheck={completeOverride.unpaid.length > 0}
        ungradedStudents={completeOverride.ungraded}
        unpaidStudents={completeOverride.unpaid}
        isRtl={isRtl}
        locale={locale}
        onSuccess={() => { onActionMessage({ type: "success", text: t.completedMsg }); onRefresh(); }}
      />
    </div>
  );
}
