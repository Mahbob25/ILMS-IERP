"use client";

import React from "react";

interface DataCardsProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderRow: (item: T) => React.ReactNode;
}

/**
 * Mobile-only card list for the read pages. Rendered below md (the tables are
 * hidden on mobile, these cards are hidden on md+), so the pages get readable
 * record rows on phones without any JS breakpoint detection.
 */
export default function DataCards<T>({ items, keyOf, renderRow }: DataCardsProps<T>) {
  if (items.length === 0) return null;
  return (
    <div className="md:hidden space-y-3">
      {items.map((item) => (
        <div key={keyOf(item)} className="card p-4">
          {renderRow(item)}
        </div>
      ))}
    </div>
  );
}
