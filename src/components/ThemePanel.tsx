"use client";

import type { FormEvent, JSX } from "react";
import { useEffect, useState } from "react";

import { DEMO_THEMES } from "@/lib/demo-names";
import type { ThemeApiResponse, ThemeCompany, ThemeResult } from "@/lib/types";

type ThemePanelProps = {
  readonly onCompanySelect: (companyName: string) => void;
};

const LOADING_MESSAGES = [
  "Researching companies with exposure to this theme...",
  "Scoring exposure and gathering rationale...",
  "Assembling theme intelligence...",
] as const;

function exposureTone(score: number): string {
  if (score >= 80) {
    return "bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.42)]";
  }

  if (score >= 60) {
    return "bg-amber-400";
  }

  return "bg-zinc-500";
}

function formatQueryTime(queryTimeMs: number): string {
  if (queryTimeMs < 1000) {
    return `${queryTimeMs}ms`;
  }

  return `${(queryTimeMs / 1000).toFixed(1)}s`;
}

function TagSection({
  title,
  items,
  emptyText,
  tone = "default",
  onSelect,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly emptyText: string;
  readonly tone?: "default" | "rose" | "neutral";
  readonly onSelect?: (value: string) => void;
}): JSX.Element {
  const chipClass =
    tone === "rose"
      ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
      : tone === "neutral"
        ? "border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-emerald-300/35 hover:text-emerald-200"
        : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">{title}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm font-light leading-relaxed text-zinc-500">{emptyText}</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((item) =>
            onSelect ? (
              <button
                className={`fi-focus-ring fi-interactive rounded-full border px-3 py-1.5 text-xs ${chipClass}`}
                key={`${title}-${item}`}
                onClick={() => {
                  onSelect(item);
                }}
                type="button"
              >
                {item}
              </button>
            ) : (
              <span
                className={`rounded-full border px-3 py-1.5 text-xs ${chipClass}`}
                key={`${title}-${item}`}
              >
                {item}
              </span>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function ThemeSkeleton({ message }: { readonly message: string }): JSX.Element {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-zinc-800 bg-zinc-900/55 p-6">
        <div className="h-3 w-28 animate-pulse rounded-full bg-zinc-800" />
        <div className="mt-5 h-10 w-2/3 animate-pulse rounded-2xl bg-zinc-800/90" />
        <div className="mt-4 h-4 w-5/6 animate-pulse rounded-full bg-zinc-900" />
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-zinc-900" />
        <p
          className="fi-fade-in fi-loading-copy mt-6 text-sm font-light text-emerald-200/80"
          key={message}
        >
          {message}
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.95fr)]">
        <section className="rounded-[2rem] border border-zinc-800 bg-zinc-900/55 p-6">
          <div className="h-3 w-32 animate-pulse rounded-full bg-zinc-800" />
          <div className="mt-5 space-y-4">
            {[0, 1, 2].map((card) => (
              <div
                className="rounded-2xl border border-zinc-800 bg-zinc-950/55 p-5"
                key={card}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="h-5 w-2/5 animate-pulse rounded-full bg-zinc-800" />
                    <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-zinc-900" />
                    <div className="mt-2 h-4 w-5/6 animate-pulse rounded-full bg-zinc-900" />
                  </div>
                  <div className="h-8 w-20 animate-pulse rounded-full bg-zinc-800" />
                </div>
                <div className="mt-5 h-2 animate-pulse rounded-full bg-zinc-900" />
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          {[0, 1, 2].map((panel) => (
            <section
              className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-6"
              key={panel}
            >
              <div className="h-3 w-28 animate-pulse rounded-full bg-zinc-800" />
              <div className="mt-5 flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((chip) => (
                  <div
                    className="h-8 w-24 animate-pulse rounded-full bg-zinc-800/90"
                    key={chip}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompanyCard({
  company,
  onCompanySelect,
}: {
  readonly company: ThemeCompany;
  readonly onCompanySelect: (companyName: string) => void;
}): JSX.Element {
  return (
    <li className="fi-card-hover rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 shadow-[0_24px_50px_-34px_rgba(0,0,0,0.95)] hover:border-emerald-400/20 hover:shadow-[0_28px_60px_-36px_rgba(52,211,153,0.12)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="fi-focus-ring fi-interactive text-left text-lg font-semibold tracking-tight text-zinc-100 hover:text-emerald-200"
              onClick={() => {
                onCompanySelect(company.companyName);
              }}
              type="button"
            >
              {company.companyName}
            </button>
            {company.ticker !== null ? (
              <span className="rounded-full border border-blue-400/20 bg-blue-950/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-200">
                {company.ticker}
              </span>
            ) : (
              <span className="rounded-full border border-amber-400/20 bg-amber-950/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                Private
              </span>
            )}
          </div>

          <p className="mt-3 text-sm font-light leading-relaxed text-zinc-400">
            {company.rationale}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-right">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Exposure</p>
          <p className="mt-2 text-sm font-semibold text-zinc-100">
            {company.exposureScore}/100
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
          <div
            aria-hidden="true"
            className={`h-full rounded-full ${exposureTone(company.exposureScore)}`}
            style={{ width: `${company.exposureScore}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Click company name to open company analysis
          </p>
          <span className="text-xs uppercase tracking-[0.18em] text-zinc-400">
            {company.exposureScore}/100
          </span>
        </div>
      </div>
    </li>
  );
}

export function ThemePanel({ onCompanySelect }: ThemePanelProps): JSX.Element {
  const [themeQuery, setThemeQuery] = useState("");
  const [result, setResult] = useState<ThemeResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setLoadingStageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingStageIndex((currentIndex) => (currentIndex + 1) % LOADING_MESSAGES.length);
    }, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [isLoading]);

  const handleExplore = async (nextTheme?: string): Promise<void> => {
    const candidateTheme = (nextTheme ?? themeQuery).trim();

    if (candidateTheme.length === 0) {
      setError("Describe a theme to explore.");
      setResult(null);
      return;
    }

    setThemeQuery(candidateTheme);
    setIsLoading(true);
    setLoadingStageIndex(0);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/themes", {
        body: JSON.stringify({ theme: candidateTheme }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as ThemeApiResponse;

      if (response.status === 429) {
        setError("Hit rate limit. Please wait a minute and try again.");
        return;
      }

      if (response.status === 408 || response.status === 504) {
        setError("Request timed out. Exa Deep can take 15 seconds - please wait and retry.");
        return;
      }

      if (!response.ok || !data.ok || data.result === undefined) {
        setError(data.error ?? "Theme exploration failed. Please try again.");
        return;
      }

      setResult(data.result);
    } catch {
      setError("Theme exploration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void handleExplore();
  };

  return (
    <section className="fi-fade-in rounded-[2rem] border border-zinc-800 bg-zinc-950/80 shadow-[0_32px_120px_-60px_rgba(15,23,42,1)] backdrop-blur">
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-950 to-emerald-950/20 px-6 py-6">
        <div className="max-w-4xl">
          <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Theme Intelligence</p>
          <h2 className="mt-3 text-3xl font-semibold text-zinc-100">
            Map an investment theme to the companies most exposed to it.
          </h2>
          <p className="mt-3 text-sm font-light leading-relaxed text-zinc-400">
            Describe a theme and Exa Deep will return a ranked exposure map, structural
            drivers, headwinds, and adjacent themes to investigate next.
          </p>
        </div>

        <form className="mt-6 flex flex-col gap-3 lg:flex-row" onSubmit={handleSubmit}>
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/85 p-3 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.95)] backdrop-blur focus-within:border-emerald-400/30 focus-within:ring-2 focus-within:ring-emerald-400/50">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400">
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 4v16M4 12h16"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <input
              aria-label="Describe an investment theme"
              autoComplete="off"
              className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500"
              disabled={isLoading}
              onChange={(event) => {
                setThemeQuery(event.target.value);
              }}
              placeholder="Describe an investment theme..."
              spellCheck={false}
              type="search"
              value={themeQuery}
            />
          </div>

          <button
            className="fi-focus-ring fi-interactive rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-200 hover:border-emerald-300/40 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? "Exploring..." : "Explore"}
          </button>
        </form>
      </div>

      <div className="space-y-6 px-6 py-6">
        {isLoading ? <ThemeSkeleton message={LOADING_MESSAGES[loadingStageIndex]} /> : null}

        {error !== null ? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {result !== null && !isLoading ? (
          <>
            <section className="rounded-[2rem] border border-zinc-800 bg-zinc-900/55 p-6 shadow-[0_24px_70px_-40px_rgba(0,0,0,0.95)]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-4xl">
                  <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Theme Overview</p>
                  <h3 className="mt-3 text-3xl font-semibold text-zinc-100">{result.themeName}</h3>
                  <p className="mt-3 text-sm font-light leading-relaxed text-zinc-400">
                    {result.themeDescription.length > 0
                      ? result.themeDescription
                      : "No theme description was returned for this search."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 xl:max-w-md xl:justify-end">
                  <span className="rounded-full border border-zinc-800 bg-zinc-950/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300">
                    {result.companies.length} companies
                  </span>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200">
                    Query {formatQueryTime(result.queryTimeMs)}
                  </span>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.95fr)]">
              <section className="rounded-[2rem] border border-zinc-800 bg-zinc-900/55 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">Exposure Map</p>
                    <h4 className="mt-3 text-2xl font-semibold text-zinc-100">
                      Ranked Company Exposure
                    </h4>
                    <p className="mt-2 text-sm font-light leading-relaxed text-zinc-400">
                      Ordered by how central this theme appears to each company.
                    </p>
                  </div>
                </div>

                {result.companies.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/45 px-4 py-8 text-sm font-light text-zinc-500">
                    No companies found for this theme.
                  </div>
                ) : (
                  <ul className="mt-5 space-y-4">
                    {result.companies.map((company) => (
                      <CompanyCard
                        company={company}
                        key={`${company.companyName}-${company.ticker ?? "private"}`}
                        onCompanySelect={onCompanySelect}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <div className="space-y-6">
                <TagSection
                  emptyText="No structural drivers were returned for this theme."
                  items={result.keyDrivers}
                  title="Key Drivers"
                />
                <TagSection
                  emptyText="No headwinds were returned for this theme."
                  items={result.headwinds}
                  title="Headwinds"
                  tone="rose"
                />
                <TagSection
                  emptyText="No adjacent themes were returned for this search."
                  items={result.relatedThemes}
                  onSelect={(relatedTheme) => {
                    setThemeQuery(relatedTheme);
                    void handleExplore(relatedTheme);
                  }}
                  title="Related Themes"
                  tone="neutral"
                />
              </div>
            </div>
          </>
        ) : null}

        {result === null && !isLoading ? (
          <section className="rounded-[2rem] border border-dashed border-zinc-800 bg-zinc-950/50 px-6 py-10">
            <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">No Theme Loaded</p>
            <h3 className="mt-4 max-w-3xl text-3xl font-semibold text-zinc-100">
              Start with a theme like EV charging infrastructure, BNPL payments, or AI inference chips.
            </h3>
            <p className="mt-4 max-w-3xl text-sm font-light leading-relaxed text-zinc-400">
              The resulting company map is designed to hand you directly into the existing
              Company workflow when a name looks worth deeper diligence.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="w-full text-xs uppercase tracking-[0.22em] text-zinc-600">
                Try a starter theme:
              </span>
              {DEMO_THEMES.map((theme) => (
                <button
                  className="fi-focus-ring fi-interactive rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-zinc-400 hover:border-emerald-400/25 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  key={theme}
                  onClick={() => {
                    setThemeQuery(theme);
                    void handleExplore(theme);
                  }}
                  type="button"
                >
                  {theme}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

export default ThemePanel;
