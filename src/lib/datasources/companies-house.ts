import type { SearchResult } from "@/lib/types";

export async function searchCompaniesHouse(
  query: string,
): Promise<SearchResult[]> {
  return [
    {
      id: "companies-house-placeholder",
      name: query || "Placeholder Company",
      jurisdiction: "GB",
      description: "Companies House placeholder result.",
    },
  ];
}

export const companiesHouseDatasource = {
  name: "companies-house",
  search: searchCompaniesHouse,
};

export default companiesHouseDatasource;
