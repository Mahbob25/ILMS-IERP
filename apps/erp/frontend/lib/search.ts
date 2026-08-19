import { apiClient } from "@/lib/api";

export interface SearchHit {
  id: string;
  type: string;
  label: string;
  sublabel?: string | null;
  href: string;
}

export interface GroupedSearchResponse {
  query: string;
  total: number;
  results: Record<string, SearchHit[]>;
}

export async function searchGrouped(q: string, locale: string = "ar", limitPerType: number = 5): Promise<GroupedSearchResponse> {
  const res = await apiClient.get<GroupedSearchResponse>("/search", {
    params: { q, locale, limit_per_type: limitPerType },
  });
  return res.data;
}
