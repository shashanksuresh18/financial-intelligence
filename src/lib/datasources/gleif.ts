import type { SearchResult } from "@/lib/types";

export async function searchGleif(query: string): Promise<SearchResult[]> {
  return [
    {
      id: "gleif-placeholder",
      name: query || "Placeholder Company",
      jurisdiction: "Global",
      description: "GLEIF placeholder result.",
    },
  ];
}

export const gleifDatasource = {
  name: "gleif",
  search: searchGleif,
};

export default gleifDatasource;
