"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

interface LastUpdatedValue {
  /** `X-Data-As-Of` from the BFF for whatever the page is currently showing. */
  asOf: string | null;
  setAsOf: (value: string | null) => void;
}

const LastUpdatedContext = createContext<LastUpdatedValue | undefined>(undefined);

/**
 * Lets a page publish its data timestamp up to the app header, which owns the
 * "آخر تحديث" indicator. The layout can't read it any other way: the header is
 * rendered outside the page, and the timestamp arrives per-page from the BFF's
 * `X-Data-As-Of` header.
 */
export function LastUpdatedProvider({ children }: { children: React.ReactNode }) {
  const [asOf, setAsOf] = useState<string | null>(null);
  const value = useMemo(() => ({ asOf, setAsOf }), [asOf]);

  return <LastUpdatedContext.Provider value={value}>{children}</LastUpdatedContext.Provider>;
}

export function useLastUpdated(): LastUpdatedValue {
  const context = useContext(LastUpdatedContext);
  if (!context) {
    throw new Error("useLastUpdated must be used within a LastUpdatedProvider");
  }
  return context;
}
