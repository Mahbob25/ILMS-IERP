"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/components/AuthContext";
import { Bell, Check, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { renderNotification } from "@/components/notifications/notificationMessages";
import ConfirmModal from "@/components/ConfirmModal";

const POLL_INTERVAL_MS = 30_000;
const MAX_DROPDOWN_ITEMS = 10;

interface NotificationItem {
  id: string;
  type: string;
  title_key: string;
  body_key: string | null;
  params: Record<string, string> | null;
  target_href: string | null;
  priority: "high" | "normal" | "low";
  is_read: boolean;
  created_at: string;
}

const priorityAccent: Record<string, string> = {
  high: "border-rose-400 bg-rose-50",
  normal: "border-amber-300 bg-amber-50",
  low: "border-slate-200 bg-slate-50",
};

function relativeTime(dateStr: string, locale: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return locale === "ar" ? "الآن" : "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)
    return locale === "ar" ? `قبل ${diffMin}د` : `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)
    return locale === "ar" ? `قبل ${diffHr}س` : `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7)
    return locale === "ar" ? `قبل ${diffDay}ي` : `${diffDay}d ago`;

  return new Date(dateStr).toLocaleDateString(
    locale === "ar" ? "ar-SA" : "en-US",
    { month: "short", day: "numeric" },
  );
}

export default function NotificationBell() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";

  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [confirmAmendment, setConfirmAmendment] = useState<{
    notificationId: string;
    amendmentId: string;
    action: "approve" | "reject";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const bellRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiClient.get<{ unread_count: number }>(
        "/notifications/unread-count",
      );
      setUnreadCount(res.data.unread_count);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{
        items: NotificationItem[];
        total: number;
      }>("/notifications", { params: { per_page: MAX_DROPDOWN_ITEMS, page: 1 } });
      setItems(res.data.items);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling + focus listener
  useEffect(() => {
    if (!user) return;

    fetchUnreadCount();

    pollRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);

    const onFocus = () => fetchUnreadCount();
    window.addEventListener("focus", onFocus);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, fetchUnreadCount]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      fetchItems();
      fetchUnreadCount();
    }
  };

  const handleClickItem = async (item: NotificationItem) => {
    setOpen(false);

    // Mark as read
    try {
      await apiClient.post("/notifications/read", { ids: [item.id] });
      fetchUnreadCount();
    } catch {
      // best-effort
    }

    // Navigate
    if (item.target_href) {
      router.push(`/${locale}/${item.target_href}`);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.post("/notifications/read", { ids: [] });
      setUnreadCount(0);
      fetchItems();
    } catch {
      // best-effort
    }
  };

  const handleAmendmentAction = async () => {
    if (!confirmAmendment) return;
    const { amendmentId, action, notificationId } = confirmAmendment;
    setConfirmAmendment(null);
    setActionLoading(true);
    try {
      await apiClient.put(`/lms/amendments/${amendmentId}/${action}`);
      await apiClient.post("/notifications/read", { ids: [notificationId] });
      setItems((prev) => prev.filter((item) => item.id !== notificationId));
      fetchUnreadCount();
    } catch {
      // best-effort
    } finally {
      setActionLoading(false);
    }
  };

  const t = locale === "en"
    ? {
        confirmApproveTitle: "Approve Amendment",
        confirmApproveMsg: "Are you sure you want to approve this contract amendment?",
        confirmRejectTitle: "Reject Amendment",
        confirmRejectMsg: "Are you sure you want to reject this contract amendment?",
        confirmYes: "Yes",
        cancel: "Cancel",
        approveLabel: "Confirm Approval",
        rejectLabel: "Confirm Rejection",
      }
    : {
        confirmApproveTitle: "الموافقة على التعديل",
        confirmApproveMsg: "هل أنت متأكد من الموافقة على تعديل العقد؟",
        confirmRejectTitle: "رفض التعديل",
        confirmRejectMsg: "هل أنت متأكد من رفض تعديل العقد؟",
        confirmYes: "نعم",
        cancel: "إلغاء",
        approveLabel: "تأكيد الموافقة",
        rejectLabel: "تأكيد الرفض",
      };

  if (!user) return null;

  const badgeLabel =
    unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : "";

  return (
    <div ref={bellRef} className="relative">
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors duration-150"
        aria-label={locale === "ar" ? "الإشعارات" : "Notifications"}
      >
        <Bell size={18} />
        {badgeLabel && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full leading-none">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden ${
            locale === "ar" ? "left-0" : "right-0"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-sm text-slate-900">
              {locale === "ar" ? "الإشعارات" : "Notifications"}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <Check size={14} />
                {locale === "ar" ? "تعليم الكل" : "Mark all read"}
              </button>
            )}
          </div>

          {/* Items */}
          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}

            {!loading && error && items.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-400">
                {locale === "ar"
                  ? "تعذر تحميل الإشعارات"
                  : "Could not load notifications"}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-400">
                {locale === "ar"
                  ? "لا توجد إشعارات"
                  : "No notifications"}
              </div>
            )}

            {items.map((item) => {
              const { title, body } = renderNotification(
                item.title_key,
                item.body_key,
                item.params,
                locale,
              );
              const isAmendment = item.type === "amendment_pending";
              const amendmentId = isAmendment ? item.params?.amendment_id : null;

              return (
                <div
                  key={item.id}
                  className={`w-full text-left px-4 py-3 border-l-2 transition-colors duration-100 hover:bg-slate-50 ${
                    priorityAccent[item.priority] ?? ""
                  } ${item.is_read ? "opacity-60" : ""}`}
                >
                  <button
                    onClick={() => handleClickItem(item)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {title}
                        </p>
                        {body && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {body}
                          </p>
                        )}
                      </div>
                      {!item.is_read && (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {relativeTime(item.created_at, locale)}
                    </p>
                  </button>

                  {isAmendment && amendmentId && (
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmAmendment({
                            notificationId: item.id,
                            amendmentId,
                            action: "approve",
                          });
                        }}
                        disabled={actionLoading}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle size={12} />
                        {locale === "ar" ? "موافقة" : "Approve"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmAmendment({
                            notificationId: item.id,
                            amendmentId,
                            action: "reject",
                          });
                        }}
                        disabled={actionLoading}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 transition-colors"
                      >
                        <AlertCircle size={12} />
                        {locale === "ar" ? "رفض" : "Reject"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmAmendment !== null}
        title={
          confirmAmendment?.action === "approve"
            ? t.confirmApproveTitle
            : t.confirmRejectTitle
        }
        message={
          confirmAmendment?.action === "approve"
            ? t.confirmApproveMsg
            : t.confirmRejectMsg
        }
        confirmLabel={
          confirmAmendment?.action === "approve"
            ? t.approveLabel
            : t.rejectLabel
        }
        cancelLabel={t.cancel}
        isRtl={locale === "ar"}
        onConfirm={handleAmendmentAction}
        onCancel={() => setConfirmAmendment(null)}
      />
    </div>
  );
}
