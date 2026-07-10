"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { X, Printer, FileDown } from "lucide-react";
import { formatDisplayDate } from "@/lib/dates";
import { apiClient } from "@/lib/api";
import { generatePdfFromHtml } from "@/lib/generatePdfFromHtml";

export interface ReceiptData {
  id?: string;
  type: "payment" | "expense";
  receipt_number: string;
  date: string;
  amount: number;
  student_name?: string;
  course_name?: string;
  payment_method?: string;
  transaction_number?: string | null;
  recipient_name?: string;
  expense_type_label?: string;
  expense_type_variant?: "general" | "teacher" | "secretary" | "salary";
  agreed_price?: number | null;
  admin_discount?: number | null;
  total_paid?: number | null;
  balance_remaining?: number | null;
}

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  data: ReceiptData | null;
  locale: string;
  isRtl: boolean;
  instituteName?: string;
  cashierName?: string;
  currency?: string;
}

const typeStyles: Record<string, string> = {
  general: "bg-slate-100 text-slate-600 border-slate-200",
  teacher: "bg-amber-50 text-amber-600 border-amber-200",
  secretary: "bg-purple-50 text-purple-600 border-purple-200",
  salary: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

export default function ReceiptModal({
  open,
  onClose,
  data,
  locale,
  isRtl,
  instituteName = "Al-Drasat ERP",
  cashierName = "",
  currency = "ريال",
}: ReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);

  const isAr = locale === "ar";

  const labels = {
    receiptTitle: isAr ? "إيصال دفع" : "Payment Receipt",
    voucherTitle: isAr ? "سند صرف" : "Payment Voucher",
    receiptNo: isAr ? "رقم الإيصال" : "Receipt No.",
    voucherNo: isAr ? "رقم السند" : "Voucher No.",
    date: isAr ? "التاريخ" : "Date",
    student: isAr ? "الطالب" : "Student",
    course: isAr ? "المقرر" : "Course",
    paymentMethod: isAr ? "طريقة الدفع" : "Payment Method",
    transactionNo: isAr ? "رقم العملية" : "Transaction No.",
    cash: isAr ? "نقداً" : "Cash",
    online: isAr ? "تحويل بنكي" : "Bank Transfer",
    recipient: isAr ? "المستلم" : "Recipient",
    type: isAr ? "النوع" : "Type",
    agreedPrice: isAr ? "السعر المتفق عليه" : "Agreed Price",
    discount: isAr ? "الخصم" : "Discount",
    totalPaid: isAr ? "إجمالي المدفوع" : "Total Paid",
    balance: isAr ? "المتبقي" : "Balance",
    paid: isAr ? "مدفوع" : "Paid",
    cashier: isAr ? "أمين الصندوق" : "Cashier",
    signature: isAr ? "التوقيع" : "Signature",
    print: isAr ? "طباعة" : "Print",
    downloadPdf: isAr ? "تحميل PDF" : "Download PDF",
    close: isAr ? "إغلاق" : "Close",
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  const formatDate = (d: string) => formatDisplayDate(d, isAr ? "ar" : "en");

  const formatCurrency = (val: number) => {
    return `${val.toFixed(2)} ${currency}`;
  };

  const handlePrint = async () => {
    if (!data?.id) return;

    try {
      const endpoint =
        data.type === "payment"
          ? `/lms/payments/${data.id}/preview?locale=${locale}`
          : `/lms/expenses/${data.id}/preview?locale=${locale}`;

      const res = await apiClient.get(endpoint, { responseType: "text" });
      const htmlContent = res.data as string;

      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${data.receipt_number}</title>
          <base href="${window.location.origin}/">
        </head>
        <body>
          ${htmlContent}
          <script>window.print();window.close();<\/script>
        </body>
        </html>
      `);

      printWindow.document.close();
    } catch (err) {
      console.error("Print failed:", err);
    }
  };

  const handleDownloadPdf = async () => {
    if (!data?.id) return;

    try {
      const endpoint =
        data.type === "payment"
          ? `/lms/payments/${data.id}/preview?locale=${locale}`
          : `/lms/expenses/${data.id}/preview?locale=${locale}`;

      const res = await apiClient.get(endpoint, { responseType: "text" });
      const htmlContent = res.data as string;

      await generatePdfFromHtml(htmlContent, {
        filename: `${data.receipt_number}.pdf`,
        width: 210,
        height: 148,
        orientation: "l",
        format: "a5",
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
    }
  };

  if (!open || !data) return null;

  const isPayment = data.type === "payment";

  const paymentMethodLabel =
    data.payment_method === "online" ? labels.online : labels.cash;

  const expenseTypeClass = data.expense_type_variant
    ? typeStyles[data.expense_type_variant] || typeStyles.general
    : typeStyles.general;

  const showDiscount = data.admin_discount != null && data.admin_discount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <div
          id="receipt-content"
          ref={receiptRef}
          className="receipt-print-area"
        >
          <div className="bg-gradient-to-r from-brand-600 to-brand-800 px-8 pt-7 pb-5 text-center">
            <h2 className="text-lg font-bold text-white tracking-wide">
              {instituteName}
            </h2>
            <p className="text-white/70 text-xs mt-1">
              {isPayment ? labels.receiptTitle : labels.voucherTitle}
            </p>
            <span className="inline-block mt-2.5 px-3.5 py-1 rounded-full text-[11px] font-semibold tracking-wider bg-white/15 text-white border border-white/20">
              {data.receipt_number}
            </span>
          </div>
          <div className="h-1 bg-gradient-to-r from-ai-600 to-ai-400" />
          <div className="px-8 pt-5 pb-6 space-y-1">
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-slate-400">
                {isPayment ? labels.date : labels.date}
              </span>
              <span className="font-medium text-slate-800">
                {formatDate(data.date)}
              </span>
            </div>

            {isPayment ? (
              <>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-slate-400">{labels.student}</span>
                  <span className="font-medium text-slate-800">
                    {data.student_name || "—"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-slate-400">{labels.course}</span>
                  <span className="text-slate-800">
                    {data.course_name || "—"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-slate-400">{labels.paymentMethod}</span>
                  <span className="font-medium text-slate-800">
                    {paymentMethodLabel}
                  </span>
                </div>
                {data.transaction_number && (
                  <div className="flex justify-between py-1.5 text-sm">
                    <span className="text-slate-400">
                      {labels.transactionNo}
                    </span>
                    <span className="font-mono text-xs text-slate-700">
                      {data.transaction_number}
                    </span>
                  </div>
                )}

                {(data.agreed_price != null ||
                  showDiscount ||
                  data.total_paid != null ||
                  data.balance_remaining != null) && (
                  <>
                    <hr className="border-t border-dashed border-slate-200 my-3" />
                    <div className="space-y-1.5">
                      {data.agreed_price != null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">
                            {labels.agreedPrice}
                          </span>
                          <span className="text-slate-700">
                            {formatCurrency(data.agreed_price)}
                          </span>
                        </div>
                      )}
                      {showDiscount && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">
                            {labels.discount}
                          </span>
                          <span className="text-red-500">
                            -{formatCurrency(data.admin_discount!)}
                          </span>
                        </div>
                      )}
                    </div>
                    <hr className="border-t border-solid border-slate-200 my-3" />
                  </>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-slate-400">{labels.type}</span>
                  <span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${expenseTypeClass}`}
                    >
                      {data.expense_type_label || "—"}
                    </span>
                  </span>
                </div>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-slate-400">{labels.recipient}</span>
                  <span className="font-medium text-slate-800">
                    {data.recipient_name || "—"}
                  </span>
                </div>
              </>
            )}

            <div className="flex justify-between items-baseline pt-4 pb-2">
              <span className="text-base font-bold text-slate-800">
                {isPayment ? labels.paid : labels.paid}
              </span>
              <span
                className={`text-2xl font-extrabold ${isPayment ? "text-emerald-600" : "text-red-500"}`}
              >
                {formatCurrency(data.amount)}
              </span>
            </div>

            {isPayment && data.balance_remaining != null && (
              <div className="flex justify-between text-sm pt-1 border-t border-dashed border-slate-200">
                <span className="text-slate-400">{labels.balance}</span>
                <span
                  className={`font-semibold ${data.balance_remaining > 0 ? "text-amber-600" : "text-emerald-600"}`}
                >
                  {formatCurrency(data.balance_remaining)}
                </span>
              </div>
            )}

            <div className="flex justify-between pt-8 text-[11px] text-slate-400">
              <span>
                {labels.cashier}:{" "}
                {cashierName ? cashierName : "_______________"}
              </span>
              <span>
                {isPayment
                  ? isAr
                    ? "توقيع الطالب: _______________"
                    : `Student ${labels.signature}: _______________`
                  : isAr
                    ? "توقيع المستلم: _______________"
                    : `Recipient ${labels.signature}: _______________`}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 flex gap-3 justify-end px-8 py-4">
          <button
            onClick={handlePrint}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Printer size={15} />
            <span>{labels.print}</span>
          </button>
          <button
            onClick={handleDownloadPdf}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <FileDown size={15} />
            <span>{labels.downloadPdf}</span>
          </button>
          <button onClick={onClose} className="btn-secondary text-sm">
            {labels.close}
          </button>
        </div>
      </div>
    </div>
  );
}
