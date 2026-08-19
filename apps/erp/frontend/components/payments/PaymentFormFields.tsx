"use client";

import React from "react";
import Select from "@/components/ui/Select";

export interface PaymentFormState {
  enrollment_id: string;
  amount: string;
  date: string;
  payment_method: string;
  transaction_number: string;
}

export interface PaymentSummary {
  total_paid: number;
  agreed_price: number | null;
  admin_discount: number | null;
  net_price: number | null;
  balance_remaining: number | null;
}

export interface PaymentFormLabels {
  selectEnrollment: string;
  enterAmount: string;
  paymentDate: string;
  paymentMethod: string;
  cash: string;
  online: string;
  transactionNumber: string;
  enterTransactionNumber: string;
  agreedPrice: string;
  discount: string;
  netPrice: string;
  totalPaid: string;
  remaining: string;
  sar: string;
}

interface PaymentFormFieldsProps {
  form: PaymentFormState;
  onFormChange: (patch: Partial<PaymentFormState>) => void;
  enrollmentOptions: { value: string; label: string }[];
  onEnrollmentSelect: (enrollmentId: string) => void;
  summary: PaymentSummary | null;
  formError: string;
  labels: PaymentFormLabels;
}

export default function PaymentFormFields({
  form,
  onFormChange,
  enrollmentOptions,
  onEnrollmentSelect,
  summary,
  formError,
  labels,
}: PaymentFormFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {labels.selectEnrollment}
          </label>
          <Select
            value={form.enrollment_id}
            onChange={(value) => onEnrollmentSelect(value)}
            options={enrollmentOptions}
            placeholder="--"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {labels.enterAmount}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={summary?.balance_remaining ?? ""}
            value={form.amount}
            onChange={(e) => {
              const val = e.target.value;
              if (
                summary?.balance_remaining != null &&
                parseFloat(val) > summary.balance_remaining
              ) {
                onFormChange({
                  amount: summary.balance_remaining.toString(),
                });
              } else {
                onFormChange({ amount: val });
              }
            }}
            className="input-field"
            placeholder="0.00"
          />
          {!form.enrollment_id && (
            <p className="text-xs text-slate-400 mt-2">
              {labels.selectEnrollment}
            </p>
          )}
          {summary && (
            <div className="text-xs text-slate-600 space-y-0.5 mt-2 p-2 bg-slate-50 rounded-lg">
              <div className="flex justify-between">
                <span>{labels.agreedPrice}:</span>
                <span className="font-medium">
                  {summary.agreed_price?.toFixed(2) ?? "—"} {labels.sar}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{labels.discount}:</span>
                <span className="font-medium">
                  {summary.admin_discount != null
                    ? `${summary.admin_discount}%`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{labels.netPrice}:</span>
                <span className="font-medium">
                  {summary.net_price?.toFixed(2)} {labels.sar}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{labels.totalPaid}:</span>
                <span className="font-medium">
                  {summary.total_paid.toFixed(2)} {labels.sar}
                </span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>{labels.remaining}:</span>
                <span>
                  {summary.balance_remaining != null
                    ? summary.balance_remaining.toFixed(2)
                    : "—"}{" "}
                  {labels.sar}
                </span>
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {labels.paymentDate}
          </label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => onFormChange({ date: e.target.value })}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            {labels.paymentMethod}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() =>
                onFormChange({
                  payment_method: "cash",
                  transaction_number: "",
                })
              }
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                form.payment_method === "cash"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {labels.cash}
            </button>
            <button
              onClick={() => onFormChange({ payment_method: "online" })}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                form.payment_method === "online"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {labels.online}
            </button>
          </div>
          {form.payment_method === "online" && (
            <input
              type="text"
              value={form.transaction_number}
              onChange={(e) =>
                onFormChange({ transaction_number: e.target.value })
              }
              placeholder={labels.enterTransactionNumber}
              className="input-field mt-2"
              required
            />
          )}
        </div>
      </div>
      {formError && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          {formError}
        </div>
      )}
    </>
  );
}
