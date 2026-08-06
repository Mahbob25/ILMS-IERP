"use client";

import { useState, useCallback } from "react";

interface UndoConfig {
  undoEndpoint: string;
  undoMethod?: "post" | "delete";
  undoBody?: Record<string, unknown>;
  toastMessage: string;
  onUndoSuccess?: () => void;
}

export function useUndoableAction() {
  const [undoConfig, setUndoConfig] = useState<UndoConfig | null>(null);

  const showUndo = useCallback((config: UndoConfig) => {
    setUndoConfig(config);
  }, []);

  const dismissUndo = useCallback(() => {
    setUndoConfig(null);
  }, []);

  return {
    undoConfig,
    showUndo,
    dismissUndo,
  };
}