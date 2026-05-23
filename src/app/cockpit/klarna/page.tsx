import type { Metadata } from "next";

import KlarnaCockpit from "@/components/KlarnaCockpit";
import { fetchFmpLiveQuote } from "@/lib/datasources/fmp";
import { getKlarnaCockpitData } from "@/lib/klarna-cockpit-data";

export const metadata: Metadata = {
  title: "Klarna V2 Cockpit | Financial Intelligence",
  description:
    "A one-screen Klarna investment cockpit prototype built from the saved source-backed research pack.",
};

export const dynamic = "force-dynamic";

export default async function KlarnaCockpitPage() {
  const quoteResult = await fetchFmpLiveQuote("KLAR");
  const data = getKlarnaCockpitData(
    quoteResult.success ? quoteResult.data : null,
  );

  return <KlarnaCockpit data={data} />;
}
