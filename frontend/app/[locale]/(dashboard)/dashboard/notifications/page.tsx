"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { renderNotification } from "@/components/notifications/notificationMessages";
import {
  Bell,
  Check,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle,
  Unlock,
  Trash2,
  X,
} from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import UndoToast from "@/components/UndoToast";

const UNDO_CLEAR_SECONDS = 30;

interface NotificationItem {
  id: string;
  type: string;
  title_key: string;
  body_key: string | null;
  params: Record<string, string> | null;
  target_href: string | null;
  priority: "high" | "normal" | "low";
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

const PRIORITY_LABELS: Record<string, { ar: string; en: string }> = {
  high: { ar: "عالي", en: "High" },
  normal: { ar: "عادي", en: "Normal" },
  low: { ar: "منخفض", en: "Low" },
};

const PRIORITY_CLASSES: Record<string, string> = {
  high: "bg-rose-100 text-rose-700",
  normal: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

export default function NotificationsPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<{
    notificationId: string;
    type: "amendment" | "unlock";
    params: Record<string, string>;
    action: "approve" | "reject";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [clearedItems, setClearedItems] = useState<NotificationItem[] | null>(null);

  const t = {
    ar: {
      title: "الإشعارات",
      subtitle: "جميع الإشعارات والتنبيهات",
      all: "الكل",
      unread: "غير المقروءة",
      markAllRead: "تعليم الكل كمقروء",
      noNotifications: "لا توجد إشعارات",
      loadError: "تعذر تحميل الإشعارات",
      prev: "السابق",
      next: "التالي",
      pageInfo: "صفحة {page} من {total} ({count} إشعار)",
      priority: "الأولوية",
      read: "مقروء",
      unreadLabel: "غير مقروء",
      approve: "موافقة",
      reject: "رفض",
      confirmApproveTitle: "الموافقة على التعديل",
      confirmApproveMsg: "هل أنت متأكد من الموافقة على تعديل العقد؟",
      confirmRejectTitle: "رفض التعديل",
      confirmRejectMsg: "هل أنت متأكد من رفض تعديل العقد؟",
      confirmYes: "نعم",
      approveConfirm: "تأكيد الموافقة",
      rejectConfirm: "تأكيد الرفض",
      cancel: "إلغاء",
      unlockTitle: "الموافقة على فتح اليوم",
      unlockMsg: "هل أنت متأكد من الموافقة على طلب فتح هذا اليوم؟",
      unlockConfirm: "تأكيد الفتح",
      unlockButton: "الموافقة على الفتح",
      clearAll: "مسح الكل",
      undoTooltip: "تراجع عن المسح",
    },
    en: {
      title: "Notifications",
      subtitle: "All notifications and alerts",
      all: "All",
      unread: "Unread",
      markAllRead: "Mark all as read",
      noNotifications: "No notifications",
      loadError: "Failed to load notifications",
      prev: "Previous",
      next: "Next",
      pageInfo: "Page {page} of {total} ({count} notifications)",
      priority: "Priority",
      read: "Read",
      unreadLabel: "Unread",
      approve: "Approve",
      reject: "Reject",
      confirmApproveTitle: "Approve Amendment",
      confirmApproveMsg: "Are you sure you want to approve this contract amendment?",
      confirmRejectTitle: "Reject Amendment",
      confirmRejectMsg: "Are you sure you want to reject this contract amendment?",
      confirmYes: "Yes",
      approveConfirm: "Confirm Approval",
      rejectConfirm: "Confirm Rejection",
      cancel: "Cancel",
      unlockTitle: "Approve Unlock",
      unlockMsg: "Are you sure you want to approve this day unlock request?",
      unlockConfirm: "Confirm Unlock",
      unlockButton: "Approve Unlock",
      clearAll: "Clear All",
      undoTooltip: "Undo clear",
    },
  }[locale === "en" ? "en" : "ar"];

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        items: NotificationItem[];
        total: number;
        page: number;
        pages: number;
      }>("/notifications", {
        params: {
          page,
          per_page: 20,
          ...(unreadOnly ? { unread_only: true } : {}),
        },
      });
      setItems(res.data.items);
      setTotal(res.data.total);
      setTotalPages(res.data.pages);
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly, t.loadError]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    setMarkingIds((prev) => new Set(prev).add(id));
    try {
      await apiClient.post("/notifications/read", { ids: [id] });
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, is_read: true, read_at: new Date().toISOString() } : item,
        ),
      );
    } catch {
      // best-effort
    } finally {
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDeleteOne = async (id: string) => {
    try {
      await apiClient.delete(`/notifications/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => prev - 1);
    } catch {
      // best-effort
    }
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await apiClient.post("/notifications/read", { ids: [] });
      await fetchNotifications();
    } catch {
      // best-effort
    }
  };

  const handleClearAll = () => {
    const snapshot = [...items];
    setClearedItems(snapshot);
    setItems([]);
    setTotal(0);
    setTotalPages(1);
  };

  const handleUndoClear = () => {
    if (clearedItems) {
      setItems(clearedItems);
    }
    setClearedItems(null);
  };

  const handleDismissClear = async () => {
    try {
      if (clearedItems && clearedItems.length > 0) {
        await apiClient.delete("/notifications");
      }
    } catch {
      // best-effort
    }
    setClearedItems(null);
    fetchNotifications();
  };

  const handleFilterChange = (unread: boolean) => {
    setPage(1);
    setUnreadOnly(unread);
  };

  const handleNavigate = (href: string | null) => {
    if (href) router.push(`/${locale}/${href}`);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { params: p, action, notificationId, type } = confirmAction;
    setConfirmAction(null);
    setActionLoading(true);
    try {
      if (type === "amendment") {
        await apiClient.put(`/lms/amendments/${p.amendment_id}/${action}`);
      } else if (type === "unlock") {
        await apiClient.post(`/lms/daily-closures/${p.date}/approve-unlock`);
      }
      await apiClient.post("/notifications/read", { ids: [notificationId] });
      setItems((prev) => prev.filter((item) => item.id !== notificationId));
    } catch {
      // best-effort
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(
      locale === "ar" ? "ar-SA" : "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter tabs */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => handleFilterChange(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                !unreadOnly
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.all}
            </button>
            <button
              onClick={() => handleFilterChange(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                unreadOnly
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.unread}
            </button>
          </div>

          {total > 0 && !clearedItems && (
            <>
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Check size={14} />
                {t.markAllRead}
              </button>
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
              >
                <Trash2 size={14} />
                {t.clearAll}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 justify-center py-16 text-red-500">
          <AlertCircle size={20} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <Bell size={40} className="mb-3 text-slate-300" />
          <p className="text-sm">{t.noNotifications}</p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const { title, body } = renderNotification(
                  item.title_key,
                  item.body_key,
                  item.params,
                  locale,
                );
                const isMarking = markingIds.has(item.id);
                const isAmendment = item.type === "amendment_pending";
                const isUnlock = item.type === "unlock_requested";
                const hasActions = isAmendment || isUnlock;

                return (
                  <div
                    key={item.id}
                    className={`px-5 py-4 flex items-start gap-4 transition-colors ${
                      item.is_read ? "bg-slate-50/50" : "bg-white"
                    }`}
                  >
                    {/* Unread dot */}
                    <div className="mt-1.5 shrink-0">
                      {!item.is_read ? (
                        <span className="block h-2.5 w-2.5 rounded-full bg-blue-500" />
                      ) : (
                        <span className="block h-2.5 w-2.5" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            PRIORITY_CLASSES[item.priority] ?? PRIORITY_CLASSES.normal
                          }`}
                        >
                          {PRIORITY_LABELS[item.priority]?.[locale === "en" ? "en" : "ar"] ??
                            item.priority}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatDate(item.created_at)}
                        </span>
                      </div>
                      <p
                        className={`text-sm font-medium text-slate-900 ${
                          item.target_href ? "cursor-pointer hover:text-blue-600" : ""
                        }`}
                        onClick={() => handleNavigate(item.target_href)}
                      >
                        {title}
                      </p>
                      {body && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{body}</p>
                      )}

                      {hasActions && item.params && (
                        <div className="flex items-center gap-2 mt-2">
                          {isAmendment && item.params.amendment_id && (
                            <>
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    notificationId: item.id,
                                    type: "amendment",
                                    params: item.params!,
                                    action: "approve",
                                  })
                                }
                                disabled={actionLoading}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 transition-colors"
                              >
                                <CheckCircle size={12} />
                                {t.approve}
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmAction({
                                    notificationId: item.id,
                                    type: "amendment",
                                    params: item.params!,
                                    action: "reject",
                                  })
                                }
                                disabled={actionLoading}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 transition-colors"
                              >
                                <AlertCircle size={12} />
                                {t.reject}
                              </button>
                            </>
                          )}
                          {isUnlock && item.params.date && (
                            <button
                              onClick={() =>
                                setConfirmAction({
                                  notificationId: item.id,
                                  type: "unlock",
                                  params: item.params!,
                                  action: "approve",
                                })
                              }
                              disabled={actionLoading}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 transition-colors"
                            >
                              <Unlock size={12} />
                              {t.unlockButton}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {!item.is_read && (
                        <button
                          onClick={() => handleMarkRead(item.id)}
                          disabled={isMarking}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:text-slate-300"
                        >
                          {isMarking ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            t.read
                          )}
                        </button>
                      )}
                      {item.target_href && (
                        <button
                          onClick={() => handleNavigate(item.target_href)}
                          className="text-xs text-slate-400 hover:text-slate-600"
                          title={item.target_href}
                        >
                          <Eye size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteOne(item.id)}
                        className="text-xs text-slate-300 hover:text-red-500"
                        title={locale === "ar" ? "حذف" : "Delete"}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4 px-1">
            <p className="text-xs text-slate-500">
              {t.pageInfo
                .replace("{page}", String(page))
                .replace("{total}", String(totalPages))
                .replace("{count}", String(total))}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={confirmAction !== null}
        title={
          confirmAction?.type === "unlock"
            ? t.unlockTitle
            : confirmAction?.action === "approve"
            ? t.confirmApproveTitle
            : t.confirmRejectTitle
        }
        message={
          confirmAction?.type === "unlock"
            ? t.unlockMsg
            : confirmAction?.action === "approve"
            ? t.confirmApproveMsg
            : t.confirmRejectMsg
        }
        confirmLabel={
          confirmAction?.type === "unlock"
            ? t.unlockConfirm
            : confirmAction?.action === "approve"
            ? t.approveConfirm
            : t.rejectConfirm
        }
        cancelLabel={t.cancel}
        isRtl={locale === "ar"}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {clearedItems && (
        <UndoToast
          message={t.undoTooltip}
          durationSeconds={UNDO_CLEAR_SECONDS}
          isRtl={locale === "ar"}
          onUndo={handleUndoClear}
          onDismiss={handleDismissClear}
        />
      )}
    </div>
  );
}
