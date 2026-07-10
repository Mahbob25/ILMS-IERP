"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import PendingRefundsTable from "@/components/cashier/PendingRefundsTable";
import DisburseRefundModal from "@/components/cashier/DisburseRefundModal";
import RefundReceipt from "@/components/cashier/RefundReceipt";
import DisbursementHistory from "@/components/cashier/DisbursementHistory";

export default function CashierRefundsPage() {
  const params = useParams();
  const { user } = useAuth();
  const locale = (params?.locale as string) || "ar";
  const isRtl = locale === "ar";

  const [disburseTarget, setDisburseTarget] = useState<any>(null);
  const [receiptData, setReceiptData] = useState<{
    receiptNumber: string;
    refundId: string;
    studentName: string;
    studentCode: string;
    amount: number;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const t = {
    ar: {
      title: "المبالغ المستردة",
      subtitle: "إدارة صرف المبالغ المستردة للطلاب",
    },
    en: {
      title: "Refunds",
      subtitle: "Manage student refund disbursements",
    },
  }[locale === "en" ? "en" : "ar"];

  const handleDisburseRefund = (refund: any) => {
    setDisburseTarget(refund);
  };

  const handleDisburseSuccess = (receiptNumber: string, refundId: string) => {
    const refund = disburseTarget;
    setDisburseTarget(null);
    if (refund) {
      setReceiptData({
        receiptNumber,
        refundId,
        studentName: refund.student_name || "",
        studentCode: refund.student_code || "",
        amount: refund.amount,
      });
    }
    setRefreshKey((k) => k + 1);
  };

  const handleReceiptClose = () => {
    setReceiptData(null);
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>
      </div>

      <PendingRefundsTable
        isRtl={isRtl}
        locale={locale}
        onDisburse={handleDisburseRefund}
        refreshKey={refreshKey}
      />

      <DisbursementHistory
        isRtl={isRtl}
        locale={locale}
        refreshKey={refreshKey}
      />

      <DisburseRefundModal
        open={disburseTarget !== null}
        onClose={() => setDisburseTarget(null)}
        refund={disburseTarget}
        isRtl={isRtl}
        locale={locale}
        onSuccess={handleDisburseSuccess}
      />

      {receiptData && (
        <RefundReceipt
          open={receiptData !== null}
          onClose={handleReceiptClose}
          data={{
            receiptNumber: receiptData.receiptNumber,
            studentName: receiptData.studentName,
            studentCode: receiptData.studentCode,
            amount: receiptData.amount,
            date: formatDate(new Date().toISOString()),
            cashierName: user?.full_name || "—",
            currency: "YER",
          }}
          isRtl={isRtl}
          locale={locale}
        />
      )}
    </div>
  );
}
