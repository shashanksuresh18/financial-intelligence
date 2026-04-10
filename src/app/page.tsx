"use client";

import { type JSX, useEffect, useRef, useState } from "react";

import MonitorList from "@/components/MonitorList";
import Report from "@/components/Report";
import SearchBar from "@/components/SearchBar";
import type {
  AnalysisReport,
  AnalyzeApiResponse,
  MonitorApiResponse,
  MonitorItem,
  SearchApiResponse,
  SearchResult,
} from "@/lib/types";

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

function getResultMeta(result: SearchResult): string {
  const parts = [
    result.ticker,
    result.jurisdiction,
    result.description,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" | ");
}

export default function Home(): JSX.Element {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<readonly SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [monitorItems, setMonitorItems] = useState<readonly MonitorItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearchRequestRef = useRef(0);

  useEffect(() => {
    const loadMonitorItems = async (): Promise<void> => {
      try {
        const response = await fetch("/api/monitor");
        const data = (await response.json()) as MonitorApiResponse;

        if (data.ok) {
          setMonitorItems(data.items);
        }
      } catch {
        // Monitor list is non-critical on first paint.
      }
    };

    void loadMonitorItems();

    return () => {
      if (searchTimeoutRef.current !== null) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const runSearch = async (
    nextQuery: string,
    requestId: number,
  ): Promise<void> => {
    setIsSearching(true);

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(nextQuery)}`,
      );
      const data = (await response.json()) as SearchApiResponse;

      if (requestId !== latestSearchRequestRef.current) {
        return;
      }

      if (!response.ok || !data.ok) {
        setSearchResults([]);
        setError(data.error ?? "Search failed");
        return;
      }

      setSearchResults(data.results);
    } catch {
      if (requestId !== latestSearchRequestRef.current) {
        return;
      }

      setSearchResults([]);
      setError("Search failed");
    } finally {
      if (requestId === latestSearchRequestRef.current) {
        setIsSearching(false);
      }
    }
  };

  const handleSearch = (nextQuery: string): void => {
    setQuery(nextQuery);
    setError(null);

    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = nextQuery.trim();

    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      latestSearchRequestRef.current += 1;
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setSearchResults([]);
    setIsSearching(true);

    const requestId = latestSearchRequestRef.current + 1;
    latestSearchRequestRef.current = requestId;

    searchTimeoutRef.current = setTimeout(() => {
      void runSearch(trimmedQuery, requestId);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSelect = async (result: SearchResult): Promise<void> => {
    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current);
    }

    latestSearchRequestRef.current += 1;
    setQuery(result.name);
    setSearchResults([]);
    setIsSearching(false);
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        body: JSON.stringify({ company: result.name }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as AnalyzeApiResponse;

      if (!response.ok || !data.ok || !data.report) {
        setError(data.error ?? "Analysis failed");
        return;
      }

      setReport(data.report);
    } catch {
      setError("Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleWatch = async (result: SearchResult): Promise<void> => {
    setError(null);

    try {
      const response = await fetch("/api/monitor", {
        body: JSON.stringify({
          companyId: result.id,
          companyName: result.name,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as MonitorApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Failed to update monitor list");
        return;
      }

      setMonitorItems(data.items);
    } catch {
      setError("Failed to update monitor list");
    }
  };

  const showSearchResults = searchResults.length > 0;

  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(6,78,59,0.26),transparent_30%),radial-gradient(circle_at_80%_10%,_rgba(14,165,233,0.16),transparent_18%),linear-gradient(180deg,rgba(24,24,27,0.25),transparent_45%)]" />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_22rem]">
          <div className="rounded-[2rem] border border-zinc-800 bg-zinc-950/80 px-6 py-7 shadow-[0_32px_120px_-72px_rgba(16,185,129,0.45)] backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200/80">
              Financial Intelligence
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
              Source-backed company analysis for fast diligence.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
              Search any company to pull structured metrics, confidence scoring,
              analyst signals, and source attribution across market, filing, and
              registry datasets.
            </p>

            <div className="relative mt-8">
              <SearchBar
                onSearch={handleSearch}
                placeholder="Search any company..."
              />

              {showSearchResults ? (
                <ul className="absolute inset-x-0 z-20 mt-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.95)] backdrop-blur">
                  {searchResults.map((result) => (
                    <li
                      className="flex items-center justify-between gap-4 border-b border-zinc-800/80 px-4 py-4 last:border-b-0"
                      key={result.id}
                    >
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          void handleSelect(result);
                        }}
                        type="button"
                      >
                        <span className="block text-sm font-medium text-zinc-100">
                          {result.name}
                        </span>
                        <span className="mt-1 block truncate text-xs uppercase tracking-[0.18em] text-zinc-500">
                          {getResultMeta(result) || "Cross-source company match"}
                        </span>
                      </button>
                      <button
                        className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200 transition hover:border-sky-300/35 hover:bg-sky-400/15"
                        onClick={() => {
                          void handleWatch(result);
                        }}
                        type="button"
                      >
                        Watch
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
                Debounced live search
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
                {query.trim().length >= MIN_QUERY_LENGTH
                  ? `${searchResults.length} candidate matches`
                  : "Type at least 2 characters"}
              </span>
              {isSearching ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-200">
                  Searching live sources
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-[2rem] border border-zinc-800 bg-zinc-950/75 p-6 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Coverage
            </p>
            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Watched</p>
                <p className="mt-2 text-3xl font-semibold text-zinc-50">
                  {monitorItems.length}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Report status</p>
                <p className="mt-2 text-sm font-medium text-zinc-200">
                  {report ? `Loaded for ${report.company}` : "Awaiting company selection"}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Pipeline</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Finnhub, SEC EDGAR, Companies House, GLEIF, and Claude fallback
                  are already connected behind the analysis route.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[minmax(0,1.45fr)_22rem]">
          <div className="space-y-4">
            {isAnalyzing ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                Building analysis report...
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {report ? (
              <Report report={report} />
            ) : (
              <section className="rounded-[2rem] border border-dashed border-zinc-800 bg-zinc-950/60 px-6 py-10">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  No Active Report
                </p>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50">
                  Select a company from autocomplete to generate the dashboard report.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400">
                  The report panel will render confidence, narrative analysis,
                  financial metrics, analyst consensus, and data-source attribution
                  once a result is selected from the live search dropdown.
                </p>
              </section>
            )}
          </div>

          <aside>
            <MonitorList items={monitorItems} />
          </aside>
        </section>
      </div>
    </main>
  );
}
