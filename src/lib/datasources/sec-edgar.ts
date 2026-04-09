import type { DataSourceResult } from "@/lib/types";

export async function getSecEdgarFilings(
  cik: string,
): Promise<DataSourceResult<string[]>> {
  return {
    source: "sec-edgar",
    data: cik ? [`Placeholder filing for ${cik}`] : [],
    fetchedAt: new Date().toISOString(),
  };
}

export const secEdgarDatasource = {
  name: "sec-edgar",
  getFilings: getSecEdgarFilings,
};

export default secEdgarDatasource;
