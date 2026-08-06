"use client";

import { getLocalDateString } from "@/lib/dates";

export type WizardStep = 1 | 2 | 3 | 4;

export interface StudentInfo {
  id: string;
  full_name: string;
  student_code: string;
  email: string;
}

export interface EnrollmentInfo {
  id: string;
  agreed_price: number | null;
  total_paid: number;
  balance_remaining: number | null;
}

export interface PaymentSummary {
  total_paid: number;
  agreed_price: number | null;
  admin_discount: number | null;
  net_price: number | null;
  balance_remaining: number | null;
}

export interface PaymentInfo {
  id: string;
  receipt_number: string;
  date: string;
  amount: number;
  payment_method: string;
  transaction_number: string | null;
}

export interface Wizard1State {
  step: WizardStep;
  mode: "select" | "create";
  student: StudentInfo | null;
  isExistingStudent: boolean;
  createStudentForm: {
    student_code: string;
    full_name: string;
    email: string;
  };
  nameError: string;
  sectionId: string;
  discount: string;
  enrollment: EnrollmentInfo | null;
  summary: PaymentSummary | null;
  payment: PaymentInfo | null;
  paymentForm: {
    enrollment_id: string;
    amount: string;
    date: string;
    payment_method: string;
    transaction_number: string;
  };
  receiptOpen: boolean;
  submitting: boolean;
  error: string;
}

export type Wizard1Action =
  | { type: "SET_STEP"; step: WizardStep }
  | { type: "SET_MODE"; mode: "select" | "create" }
  | {
      type: "SELECT_STUDENT";
      student: StudentInfo;
      isExisting: boolean;
    }
  | { type: "CLEAR_STUDENT" }
  | {
      type: "SET_CREATE_FORM";
      patch: Partial<{
        student_code: string;
        full_name: string;
        email: string;
      }>;
    }
  | { type: "SET_NAME_ERROR"; nameError: string }
  | { type: "CREATE_STUDENT_START" }
  | { type: "CREATE_STUDENT_SUCCESS"; student: StudentInfo }
  | { type: "SET_SECTION"; sectionId: string }
  | { type: "SET_DISCOUNT"; discount: string }
  | { type: "ENROLL_START" }
  | {
      type: "ENROLL_SUCCESS";
      enrollment: EnrollmentInfo;
      summary: PaymentSummary;
    }
  | {
      type: "SET_PAYMENT_FORM";
      patch: Partial<{
        enrollment_id: string;
        amount: string;
        date: string;
        payment_method: string;
        transaction_number: string;
      }>;
    }
  | { type: "PAY_START" }
  | { type: "PAY_SUCCESS"; payment: PaymentInfo; summary: PaymentSummary }
  | { type: "SET_RECEIPT_OPEN"; open: boolean }
  | { type: "SKIP_PAYMENT" }
  | { type: "SET_ERROR"; error: string }
  | { type: "RESET" };

export const createInitialWizard1State = (): Wizard1State => ({
  step: 1,
  mode: "select",
  student: null,
  isExistingStudent: false,
  createStudentForm: { student_code: "", full_name: "", email: "" },
  nameError: "",
  sectionId: "",
  discount: "",
  enrollment: null,
  summary: null,
  payment: null,
  paymentForm: {
    enrollment_id: "",
    amount: "",
    date: getLocalDateString(),
    payment_method: "cash",
    transaction_number: "",
  },
  receiptOpen: false,
  submitting: false,
  error: "",
});

export function wizard1Reducer(
  state: Wizard1State,
  action: Wizard1Action
): Wizard1State {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step, error: "" };
    case "SET_MODE":
      return { ...state, mode: action.mode, nameError: "" };
    case "SELECT_STUDENT":
      return {
        ...state,
        student: action.student,
        isExistingStudent: action.isExisting,
        error: "",
      };
    case "CLEAR_STUDENT":
      return {
        ...state,
        student: null,
        isExistingStudent: false,
        mode: "select",
        error: "",
      };
    case "SET_CREATE_FORM":
      return {
        ...state,
        createStudentForm: { ...state.createStudentForm, ...action.patch },
        nameError: "",
      };
    case "SET_NAME_ERROR":
      return { ...state, nameError: action.nameError };
    case "CREATE_STUDENT_START":
      return { ...state, submitting: true, error: "" };
    case "CREATE_STUDENT_SUCCESS":
      return {
        ...state,
        submitting: false,
        student: action.student,
        isExistingStudent: false,
      };
    case "SET_SECTION":
      return { ...state, sectionId: action.sectionId, error: "" };
    case "SET_DISCOUNT":
      return { ...state, discount: action.discount, error: "" };
    case "ENROLL_START":
      return { ...state, submitting: true, error: "" };
    case "ENROLL_SUCCESS":
      return {
        ...state,
        step: 3,
        submitting: false,
        enrollment: action.enrollment,
        summary: action.summary,
        paymentForm: {
          ...state.paymentForm,
          enrollment_id: action.enrollment.id,
          amount:
            action.summary.balance_remaining != null
              ? action.summary.balance_remaining.toString()
              : "",
        },
      };
    case "SET_PAYMENT_FORM":
      return {
        ...state,
        paymentForm: { ...state.paymentForm, ...action.patch },
        error: "",
      };
    case "PAY_START":
      return { ...state, submitting: true, error: "" };
    case "PAY_SUCCESS":
      return {
        ...state,
        submitting: false,
        payment: action.payment,
        summary: action.summary,
        receiptOpen: true,
        step: 4,
      };
    case "SET_RECEIPT_OPEN":
      return { ...state, receiptOpen: action.open };
    case "SKIP_PAYMENT":
      return { ...state, step: 4, error: "" };
    case "SET_ERROR":
      return { ...state, error: action.error, submitting: false };
    case "RESET":
      return createInitialWizard1State();
    default:
      return state;
  }
}