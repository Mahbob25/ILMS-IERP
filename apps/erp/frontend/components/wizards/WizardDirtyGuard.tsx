"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import ConfirmModal from "@/components/ConfirmModal";

interface WizardDirtyContextValue {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
  guardNavigation: (navigate: () => void) => void;
}

const WizardDirtyContext = createContext<WizardDirtyContextValue | undefined>(
  undefined
);

export function useWizardDirtyGuard(): WizardDirtyContextValue {
  const context = useContext(WizardDirtyContext);
  if (!context) {
    throw new Error(
      "useWizardDirtyGuard must be used within WizardDirtyProvider"
    );
  }
  return context;
}

interface WizardDirtyProviderProps {
  children: React.ReactNode;
  locale: string;
}

export default function WizardDirtyProvider({
  children,
  locale,
}: WizardDirtyProviderProps) {
  const isAr = locale === "ar";
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  const setDirty = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const guardNavigation = useCallback(
    (navigate: () => void) => {
      if (isDirty) {
        pendingNavigationRef.current = navigate;
        setShowLeaveConfirm(true);
      } else {
        navigate();
      }
    },
    [isDirty]
  );

  const confirmLeave = useCallback(() => {
    const pending = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setShowLeaveConfirm(false);
    setIsDirty(false);
    pending?.();
  }, []);

  const cancelLeave = useCallback(() => {
    pendingNavigationRef.current = null;
    setShowLeaveConfirm(false);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return (
    <WizardDirtyContext.Provider
      value={{ isDirty, setDirty, guardNavigation }}
    >
      {children}
      <ConfirmModal
        open={showLeaveConfirm}
        title={isAr ? "مغادرة الصفحة؟" : "Leave this page?"}
        message={
          isAr
            ? "لديك تقدم غير محفوظ في المعالج. هل تريد المغادرة على أي حال؟"
            : "You have unsaved progress in the wizard. Leave anyway?"
        }
        confirmLabel={isAr ? "مغادرة" : "Leave"}
        cancelLabel={isAr ? "البقاء" : "Stay"}
        isRtl={isAr}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
    </WizardDirtyContext.Provider>
  );
}