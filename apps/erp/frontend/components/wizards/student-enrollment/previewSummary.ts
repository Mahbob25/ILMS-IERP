import type { PaymentSummary } from "./wizard1Reducer";

/**
 * Client-side preview of the price components for a section that has not been
 * enrolled yet. Mirrors the backend rules in `academic/pricing.py`: a price
 * override may only lower the current section price, and the admin discount
 * percentage is applied on top of the resulting base.
 */
export function computePreviewSummary(input: {
  sectionPrice: number | null | undefined;
  discount: string;
  priceOverride: string;
}): PaymentSummary | null {
  const override =
    input.priceOverride.trim() === "" ? null : Number(input.priceOverride);
  const discount = input.discount.trim() === "" ? null : Number(input.discount);

  let base: number | null = null;
  if (override != null && !Number.isNaN(override)) {
    base =
      input.sectionPrice != null
        ? Math.min(override, input.sectionPrice)
        : override;
  } else if (input.sectionPrice != null) {
    base = input.sectionPrice;
  }
  if (base == null) return null;

  const net =
    discount != null && !Number.isNaN(discount)
      ? base * (1 - discount / 100)
      : base;

  return {
    total_paid: 0,
    agreed_price: base,
    admin_discount: discount,
    net_price: net,
    balance_remaining: net,
  };
}
