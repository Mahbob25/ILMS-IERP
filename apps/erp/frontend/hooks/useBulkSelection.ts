"use client";

import { useState, useCallback, useMemo } from "react";

export interface BulkSelection {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  isSelected: (id: string) => boolean;
  isAllSelected: boolean;
  reset: () => void;
  selectedCount: number;
}

export function useBulkSelection(pageIds: string[]): BulkSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const pageSet = new Set(ids);
      const allOnPageSelected = ids.every((id) => prev.has(id));
      if (allOnPageSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      } else {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      }
    });
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const isAllSelected = useMemo(
    () => pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id)),
    [pageIds, selectedIds],
  );

  const reset = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    toggle,
    toggleAll,
    isSelected,
    isAllSelected,
    reset,
    selectedCount: selectedIds.size,
  };
}
