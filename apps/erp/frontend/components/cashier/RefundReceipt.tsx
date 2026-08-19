"use client";

import React from "react";
import Modal from "@/components/Modal";
import { Printer, X } from "lucide-react";

interface RefundReceiptData {
  receiptNumber: string;
  studentName: string;
  studentCode: string;
  amount: number;
  date: string;
  cashierName: string;
  currency: string;
  notes?: string;
}

interface RefundReceiptProps {
  open: boolean;
  onClose: () => void;
  data: RefundReceiptData;
  isRtl?: boolean;
  locale?: string;
  instituteName?: string;
}

export default function RefundReceipt({
  open,
  onClose,
  data,
  isRtl = false,
  locale = "ar",
  instituteName = "Al-Drasat ERP",
}: RefundReceiptProps) {
  const t = {
    ar: {
      title: "إيصال الصرف",
      receiptNumber: "رقم الإيصال",
      studentName: "اسم الطالب",
      studentCode: "رمز الطالب",
      amount: "المبلغ",
      date: "التاريخ",
      cashier: "أمين الصندوق",
      notes: "ملاحظات",
      print: "طباعة",
      close: "إغلاق",
      signature: "توقيع المستلم",
    },
    en: {
      title: "Disbursement Receipt",
      receiptNumber: "Receipt No.",
      studentName: "Student Name",
      studentCode: "Student Code",
      amount: "Amount",
      date: "Date",
      cashier: "Cashier",
      notes: "Notes",
      print: "Print",
      close: "Close",
      signature: "Recipient Signature",
    },
  }[locale === "en" ? "en" : "ar"];

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html dir="${isRtl ? "rtl" : "ltr"}">
      <head>
        <meta charset="utf-8" />
        <title>${t.title}</title>
        <style>
          body { font-family: ${isRtl ? "'IBM Plex Sans Arabic', sans-serif" : "'Inter', sans-serif"}; margin: 0; padding: 20px; }
          .receipt { max-width: 400px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
          .header h2 { margin: 0; font-size: 18px; }
          .header p { margin: 5px 0 0; font-size: 12px; color: #666; }
          .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
          .label { color: #666; }
          .value { font-weight: bold; }
          .amount { text-align: center; font-size: 24px; font-weight: bold; padding: 15px 0; border-top: 1px solid #eee; border-bottom: 1px solid #eee; margin: 10px 0; }
          .footer { margin-top: 20px; padding-top: 10px; border-top: 1px dashed #ccc; font-size: 11px; color: #999; text-align: center; }
          .signature { margin-top: 30px; border-top: 1px solid #333; padding-top: 5px; font-size: 11px; text-align: center; }
          .notes { font-size: 11px; color: #666; margin-top: 10px; padding: 8px; background: #f9f9f9; border-radius: 4px; }
          @media print { body { padding: 0; } .receipt { border: none; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h2>${instituteName}</h2>
            <p>${t.title}</p>
          </div>
          <div class="row">
            <span class="label">${t.receiptNumber}:</span>
            <span class="value">${data.receiptNumber}</span>
          </div>
          <div class="row">
            <span class="label">${t.date}:</span>
            <span class="value">${data.date}</span>
          </div>
          <div class="row">
            <span class="label">${t.studentName}:</span>
            <span class="value">${data.studentName}</span>
          </div>
          <div class="row">
            <span class="label">${t.studentCode}:</span>
            <span class="value">${data.studentCode}</span>
          </div>
          <div class="amount">${data.amount.toFixed(2)} ${data.currency}</div>
          <div class="row">
            <span class="label">${t.cashier}:</span>
            <span class="value">${data.cashierName}</span>
          </div>
          ${data.notes ? `<div class="notes"><strong>${t.notes}:</strong> ${data.notes}</div>` : ""}
          <div class="signature">${t.signature}: ____________________</div>
          <div class="footer">${instituteName} &middot; ${data.receiptNumber}</div>
        </div>
        <script>window.print(); window.close(); <\/script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  return (
    <Modal open={open} onClose={onClose} title={t.title} size="md" isRtl={isRtl}>
      <div className="space-y-4" dir={isRtl ? "rtl" : "ltr"}>
        <div className="border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
          <div className="text-center border-b border-slate-100 pb-2 mb-2">
            <p className="font-bold text-slate-900">{instituteName}</p>
            <p className="text-xs text-slate-500">{t.title}</p>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.receiptNumber}:</span>
            <span className="font-semibold text-slate-900">{data.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.date}:</span>
            <span className="font-semibold text-slate-900">{data.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.studentName}:</span>
            <span className="font-semibold text-slate-900">{data.studentName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.studentCode}:</span>
            <span className="font-semibold text-slate-900">{data.studentCode}</span>
          </div>
          <div className="text-center py-3 my-2 border-t border-b border-slate-200">
            <span className="text-2xl font-bold text-emerald-700">
              {data.amount.toFixed(2)} {data.currency}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t.cashier}:</span>
            <span className="font-semibold text-slate-900">{data.cashierName}</span>
          </div>
          {data.notes && (
            <div className="bg-slate-50 p-2 rounded text-xs text-slate-600">
              <span className="font-medium">{t.notes}: </span>
              {data.notes}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePrint}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Printer size={14} />
            {t.print}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            <X size={14} className="me-1" />
            {t.close}
          </button>
        </div>
      </div>
    </Modal>
  );
}
