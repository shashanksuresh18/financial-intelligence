import type { SearchResult } from "@/lib/types";

export async function searchFinnhub(query: string): Promise<SearchResult[]> {
  return [
    {
      id: "finnhub-placeholder",
      name: query || "Placeholder Company",
      ticker: "TBD",
      jurisdiction: "US",
      description: "Finnhub placeholder result.",
    },
  ];
}

export const finnhubDatasource = {
  name: "finnhub",
  search: searchFinnhub,
};

export default finnhubDatasource;
