"use client";

import { type JSX, useEffect, useRef, useState } from "react";

import ActiveSnapshotPanel from "@/components/ActiveSnapshotPanel";
import ErrorBoundary from "@/components/ErrorBoundary";
import MonitorList from "@/components/MonitorList";
import Report from "@/components/Report";
import SearchBar from "@/components/SearchBar";
import ThemePanel from "@/components/ThemePanel";
import { DEMO_COMPANIES } from "@/lib/demo-names";
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
const ANALYSIS_TIMEOUT_MS = 180000;
const ANALYSIS_STAGE_INTERVAL_MS = 25000;
const ANALYSIS_STAGE_MESSAGES = [
  "Resolving the company across search, filing, and registry sources.",
  "Collecting market data, registry context, and filing-backed evidence.",
  "Generating the institutional note and reconciling evidence coverage.",
  "Finalizing the report payload and saving the latest snapshot.",
] as const;

type MonitorSortKey = "confidence" | "freshness" | "evidence-depth";
type ActiveTab = "company" | "themes";

const ACTIVE_TAB_STORAGE_KEY = "fin:activeTab";

function getInitialActiveTab(): ActiveTab {
  if (typeof window === "undefined") {
    return "company";
  }

  try {
    const savedTab = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);

    return savedTab === "company" || savedTab === "themes"
      ? savedTab
      : "company";
  } catch {
    return "company";
  }
}

function getResultMeta(result: SearchResult): string {
  const parts = [
    result.ticker,
    result.jurisdiction,
    result.description,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" | ");
}

export default function Home(): JSX.Element {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getInitialActiveTab());
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<readonly SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [reportQuery, setReportQuery] = useState<string | null>(null);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [monitorItems, setMonitorItems] = useState<readonly MonitorItem[]>([]);
  const [monitorSortKey, setMonitorSortKey] =
    useState<MonitorSortKey>("confidence");
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const latestSearchRequestRef = useRef(0);
  const latestAnalysisRequestRef = useRef(0);

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

      analysisAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isAnalyzing || analysisStartedAt === null) {
      return;
    }

    const updateStage = (): void => {
      const elapsed = Date.now() - analysisStartedAt;
      const nextStage = Math.min(
        ANALYSIS_STAGE_MESSAGES.length - 1,
        Math.floor(elapsed / ANALYSIS_STAGE_INTERVAL_MS),
      );

      setAnalysisStageIndex(nextStage);
    };

    updateStage();
    const interval = setInterval(updateStage, 1500);

    return () => {
      clearInterval(interval);
    };
  }, [analysisStartedAt, isAnalyzing]);

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

  const clearLoadedReport = (): void => {
    setReport(null);
    setReportQuery(null);
  };

  const runAnalysis = async (
    analysisQuery: string,
    options?: {
      readonly forceRefresh?: boolean;
      readonly preserveExisting?: boolean;
    },
  ): Promise<void> => {
    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current);
    }

    latestAnalysisRequestRef.current += 1;
    const requestId = latestAnalysisRequestRef.current;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, ANALYSIS_TIMEOUT_MS);

    setSearchResults([]);
    setIsSearching(false);
    setIsAnalyzing(true);
    setAnalysisStartedAt(Date.now());
    setAnalysisStageIndex(0);
    setPendingQuery(analysisQuery);
    setError(null);

    if (options?.preserveExisting !== true) {
      clearLoadedReport();
    }

    try {
      const response = await fetch("/api/analyze", {
        body: JSON.stringify({
          company: analysisQuery,
          ...(options?.forceRefresh === true ? { forceRefresh: true } : {}),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const data = (await response.json()) as AnalyzeApiResponse;

      if (requestId !== latestAnalysisRequestRef.current) {
        return;
      }

      if (response.status === 429) {
        setError("Hit rate limit. Please wait a minute and try again.");
        return;
      }

      if (!response.ok || !data.ok || !data.report) {
        setError(data.error ?? "Analysis failed");
        return;
      }

      setReport(data.report);
      setReportQuery(data.report.company);
    } catch (error) {
      if (requestId === latestAnalysisRequestRef.current) {
        if (error instanceof Error && error.name === "AbortError") {
          setError(
            "Analysis is taking longer than expected on the hosted environment. Please wait a bit and try again, or retry with a public company first.",
          );
        } else {
          setError("Analysis failed");
        }
      }
    } finally {
      clearTimeout(timeoutId);

      if (requestId === latestAnalysisRequestRef.current) {
        setIsAnalyzing(false);
        setAnalysisStartedAt(null);
        setPendingQuery(null);

        if (analysisAbortRef.current === controller) {
          analysisAbortRef.current = null;
        }
      }
    }
  };

  const handleTabChange = (tab: ActiveTab): void => {
    setActiveTab(tab);

    try {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab);
    } catch {
      // localStorage can fail in private browsing or restricted environments.
    }
  };

  const handleSearch = (nextQuery: string): void => {
    setQuery(nextQuery);
    setError(null);
    latestAnalysisRequestRef.current += 1;
    setIsAnalyzing(false);
    setPendingQuery(null);

    if (searchResults.length > 0 || report !== null) {
      clearLoadedReport();
    }

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
    setQuery(result.name);
    void runAnalysis(result.name);
  };

  const handleSubmit = (submittedQuery: string): void => {
    const trimmedQuery = submittedQuery.trim();

    setQuery(submittedQuery);
    setError(null);

    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      latestSearchRequestRef.current += 1;
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    if (searchResults.length === 0) {
      void runAnalysis(trimmedQuery);
      return;
    }

    handleSearch(submittedQuery);
  };

  const handleThemeCompanySelect = (companyName: string): void => {
    handleTabChange("company");
    setQuery(companyName);
    setError(null);
    void runAnalysis(companyName);
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

  const handleRefresh = (): void => {
    const targetQuery = reportQuery ?? report?.company ?? query.trim();

    if (targetQuery.length < MIN_QUERY_LENGTH) {
      return;
    }

    void runAnalysis(targetQuery, {
      forceRefresh: true,
      preserveExisting: true,
    });
  };

  const handleMonitorSelect = (item: MonitorItem): void => {
    setQuery(item.label);
    setError(null);
    void runAnalysis(item.label);
  };

  const handleMonitorRemove = async (item: MonitorItem): Promise<void> => {
    setError(null);

    try {
      const response = await fetch(
        `/api/monitor?id=${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      const data = (await response.json()) as MonitorApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Failed to update monitor list");
        return;
      }

      setMonitorItems(data.items);

      if (loadedReportLabel === item.label) {
        clearLoadedReport();
      }
    } catch {
      setError("Failed to update monitor list");
    }
  };

  const reportStatus = (() => {
    if (isAnalyzing) {
      return pendingQuery !== null
        ? `Analyzing ${pendingQuery}`
        : "Analyzing current query";
    }

    if (report !== null) {
      return `Loaded for ${reportQuery ?? report.company}`;
    }

    if (isSearching) {
      return query.trim().length > 0
        ? `Searching ${query.trim()}`
        : "Searching current query";
    }

    return query.trim().length > 0
      ? "No report loaded for the current query"
      : "Awaiting company selection";
  })();

  const loadedReportLabel = reportQuery ?? report?.company ?? null;
  const trimmedQuery = query.trim();

  const showSearchResults = searchResults.length > 0;
  const hasReport = report !== null || isAnalyzing;

  const searchDropdown = showSearchResults ? (
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
  ) : null;

  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(6,78,59,0.26),transparent_30%),radial-gradient(circle_at_80%_10%,_rgba(14,165,233,0.16),transparent_18%),linear-gradient(180deg,rgba(24,24,27,0.25),transparent_45%)]" />

      <div className="relative mx-auto flex max-w-[96rem] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div
          aria-label="Analysis mode"
          className="flex w-fit gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1"
          role="tablist"
        >
          <button
            aria-selected={activeTab === "company"}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === "company"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
              }`}
            onClick={() => {
              handleTabChange("company");
            }}
            role="tab"
            type="button"
          >
            Company
          </button>
          <button
            aria-selected={activeTab === "themes"}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === "themes"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
              }`}
            onClick={() => {
              handleTabChange("themes");
            }}
            role="tab"
            type="button"
          >
            Themes
          </button>
        </div>

        {activeTab === "company" ? (
          <>
            {!hasReport ? (
              <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
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
                      disabled={isAnalyzing}
                      value={query}
                      onSearch={handleSearch}
                      onSubmit={handleSubmit}
                      placeholder="Search any company..."
                    />
                    {searchDropdown}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                    {trimmedQuery.length === 0 && !isAnalyzing ? (
                      <>
                        <span className="mr-1 text-zinc-600">Try:</span>
                        {DEMO_COMPANIES.map((name) => (
                          <button
                            className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-zinc-400 transition hover:border-emerald-400/25 hover:text-emerald-200"
                            key={name}
                            onClick={() => {
                              setQuery(name);
                              void runAnalysis(name);
                            }}
                            type="button"
                          >
                            {name}
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
                          Debounced live search
                        </span>
                        <span className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
                          {trimmedQuery.length >= MIN_QUERY_LENGTH
                            ? `${searchResults.length} candidate matches`
                            : "Type at least 2 characters"}
                        </span>
                        {isSearching ? (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-200">
                            Searching live sources
                          </span>
                        ) : null}
                      </>
                    )}
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
                        {reportStatus}
                      </p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                        Live query
                      </p>
                      <p className="mt-1 text-sm text-zinc-300">
                        {trimmedQuery.length > 0 ? trimmedQuery : "None"}
                      </p>
                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                        Loaded report
                      </p>
                      <p className="mt-1 text-sm text-zinc-300">
                        {loadedReportLabel ?? "None"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <div className="relative rounded-[2rem] border border-zinc-800 bg-zinc-950/80 px-5 py-4 backdrop-blur">
                <SearchBar
                  disabled={isAnalyzing}
                  value={query}
                  onSearch={handleSearch}
                  onSubmit={handleSubmit}
                  placeholder="Search another company..."
                />
                {searchDropdown}
              </div>
            )}

            <section className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
              <div className="space-y-4">
                {isAnalyzing ? (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-100">
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/12">
                        <svg
                          aria-hidden="true"
                          className="h-5 w-5 animate-spin text-emerald-200"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="3"
                          />
                          <path
                            className="opacity-90"
                            d="M22 12a10 10 0 0 1-10 10"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="3"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-emerald-50">
                          Building analysis report for {pendingQuery ?? "the current query"}...
                        </p>
                        <p className="mt-1 leading-6 text-emerald-100/85">
                          {ANALYSIS_STAGE_MESSAGES[analysisStageIndex]}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-emerald-200/70">
                          Hosted runs can take up to 3 minutes on multi-source and private-company research workflows.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                  </div>
                ) : null}

                {report ? (
                  <ErrorBoundary section="Report">
                    <Report
                      isRefreshing={isAnalyzing}
                      onRefresh={handleRefresh}
                      report={report}
                    />
                  </ErrorBoundary>
                ) : isAnalyzing ? (
                  <section className="rounded-[2rem] border border-zinc-800 bg-zinc-950/60 px-6 py-8 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      Analysis In Progress
                    </p>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50">
                      We&apos;re assembling the dashboard report for {pendingQuery ?? "your selected company"}.
                    </h2>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400">
                      The hosted demo can take a little longer while it resolves the company,
                      gathers evidence, and generates the institutional note. You can keep this
                      page open while the report is being built.
                    </p>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500">
                      First-run private or registry-led names are often the slowest because the
                      hosted app is warming up external sources and saving the initial snapshot.
                    </p>
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                        <div className="h-3 w-28 rounded-full bg-zinc-800" />
                        <div className="mt-5 h-10 w-3/4 rounded-2xl bg-zinc-800/80" />
                        <div className="mt-4 space-y-3">
                          <div className="h-3 w-full rounded-full bg-zinc-900" />
                          <div className="h-3 w-5/6 rounded-full bg-zinc-900" />
                          <div className="h-3 w-3/5 rounded-full bg-zinc-900" />
                        </div>
                      </div>
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                        <div className="h-3 w-32 rounded-full bg-zinc-800" />
                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <div className="h-20 rounded-2xl bg-zinc-900" />
                          <div className="h-20 rounded-2xl bg-zinc-900" />
                          <div className="h-20 rounded-2xl bg-zinc-900" />
                          <div className="h-20 rounded-2xl bg-zinc-900" />
                        </div>
                      </div>
                    </div>
                  </section>
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

              <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
                <MonitorList
                  activeItemLabel={loadedReportLabel}
                  disabled={isAnalyzing}
                  items={monitorItems}
                  onRemove={(item) => {
                    void handleMonitorRemove(item);
                  }}
                  onSelect={handleMonitorSelect}
                  onSortChange={setMonitorSortKey}
                  sortKey={monitorSortKey}
                />
                <ActiveSnapshotPanel
                  isAnalyzing={isAnalyzing}
                  report={report}
                />
              </aside>
            </section>
          </>
        ) : (
          <ErrorBoundary section="ThemePanel">
            <ThemePanel onCompanySelect={handleThemeCompanySelect} />
          </ErrorBoundary>
        )}
      </div>
    </main>
  );
}
