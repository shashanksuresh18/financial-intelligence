"use client";

import type { FormEvent, JSX } from "react";
import { useEffect, useState } from "react";

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
    return "bg-emerald-400";
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

function SectionCard({
  title,
  items,
  emptyText,
  tone = "default",
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly emptyText: string;
  readonly tone?: "default" | "rose";
}): JSX.Element {
  const cardTone =
    tone === "rose"
      ? "border-rose-400/20 bg-rose-400/10"
      : "border-zinc-800 bg-zinc-950/70";
  const labelTone = tone === "rose" ? "text-rose-200" : "text-zinc-300";
  const itemTone =
    tone === "rose"
      ? "border-rose-400/15 bg-zinc-950/60 text-rose-100"
      : "border-zinc-800 bg-zinc-900/60 text-zinc-300";
  const emptyTone = tone === "rose" ? "text-rose-100/70" : "text-zinc-500";

  return (
    <section className={`rounded-3xl border p-5 ${cardTone}`}>
      <p className={`text-sm font-semibold uppercase tracking-[0.22em] ${labelTone}`}>
        {title}
      </p>
      {items.length === 0 ? (
        <p className={`mt-4 text-sm leading-6 ${emptyTone}`}>{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${itemTone}`}
              key={`${title}-${item}`}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
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
    <li className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="text-left text-lg font-semibold tracking-tight text-zinc-50 transition hover:text-emerald-200"
                onClick={() => {
                  onCompanySelect(company.companyName);
                }}
                type="button"
              >
                {company.companyName}
              </button>
              {company.ticker !== null ? (
                <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                  {company.ticker}
                </span>
              ) : (
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  Private
                </span>
              )}
            </div>
            <p className="mt-3 text-sm leading-7 text-zinc-400">{company.rationale}</p>
          </div>

          <div className="shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Exposure
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-100">
              {company.exposureScore} / 100
            </p>
          </div>
        </div>

        <div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-900">
            <div
              aria-hidden="true"
              className={`h-full rounded-full transition-[width] duration-500 ${exposureTone(company.exposureScore)}`}
              style={{ width: `${company.exposureScore}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-emerald-300/80">
            Click company name to open the Company analysis flow
          </p>
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
      setLoadingStageIndex((currentIndex) =>
        (currentIndex + 1) % LOADING_MESSAGES.length,
      );
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

      if (!response.ok || !data.ok || data.result === undefined) {
        setError(data.error ?? "Theme exploration failed");
        return;
      }

      setResult(data.result);
    } catch {
      setError("Theme exploration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void handleExplore();
  };

  return (
    <section className="rounded-[2rem] border border-zinc-800 bg-zinc-950/80 shadow-[0_32px_120px_-60px_rgba(15,23,42,1)] backdrop-blur">
      <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-950 to-emerald-950/20 px-6 py-6">
        <div className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
            Theme Intelligence
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">
            Map an investment theme to the companies most exposed to it.
          </h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Describe a theme and Exa Deep will return a ranked exposure map,
            structural drivers, headwinds, and adjacent themes to investigate next.
          </p>
        </div>

        <form className="mt-6 flex flex-col gap-3 lg:flex-row" onSubmit={handleSubmit}>
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.95)]">
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
              className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
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
            className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300/40 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? "Exploring..." : "Explore"}
          </button>
        </form>
      </div>

      <div className="space-y-6 px-6 py-6">
        {isLoading ? (
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
                  Exploring theme with Exa Deep - this takes 5-15 seconds.
                </p>
                <p className="mt-1 leading-6 text-emerald-100/85">
                  {LOADING_MESSAGES[loadingStageIndex]}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {error !== null ? (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {result !== null ? (
          <>
            <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-emerald-950/10 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-4xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
                    Theme Overview
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50">
                    {result.themeName}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-zinc-400">
                    {result.themeDescription.length > 0
                      ? result.themeDescription
                      : "No theme description was returned for this search."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 xl:max-w-md xl:justify-end">
                  <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                    {result.companies.length} companies
                  </span>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                    Query {formatQueryTime(result.queryTimeMs)}
                  </span>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.95fr)]">
              <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
                      Exposure Map
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      Ranked by how central this theme appears to each company.
                    </p>
                  </div>
                </div>

                {result.companies.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-sm text-zinc-500">
                    No companies found for this theme.
                  </div>
                ) : (
                  <ul className="mt-4 space-y-4">
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
                <SectionCard
                  emptyText="No structural drivers were returned for this theme."
                  items={result.keyDrivers}
                  title="Key Drivers"
                />
                <SectionCard
                  emptyText="No headwinds were returned for this theme."
                  items={result.headwinds}
                  title="Headwinds"
                  tone="rose"
                />

                <section className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
                    Related Themes
                  </p>
                  {result.relatedThemes.length === 0 ? (
                    <p className="mt-4 text-sm leading-6 text-zinc-500">
                      No adjacent themes were returned for this search.
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {result.relatedThemes.map((relatedTheme) => (
                        <button
                          className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-300 transition hover:border-emerald-300/35 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isLoading}
                          key={relatedTheme}
                          onClick={() => {
                            setThemeQuery(relatedTheme);
                            void handleExplore(relatedTheme);
                          }}
                          type="button"
                        >
                          {relatedTheme}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </>
        ) : (
          <section className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 px-6 py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
              No Theme Loaded
            </p>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-50">
              Start with a theme like EV charging infrastructure, BNPL payments, or AI inference chips.
            </h3>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
              The resulting company map is designed to hand you directly into the
              existing Company workflow when a name looks worth deeper diligence.
            </p>
          </section>
        )}
      </div>
    </section>
  );
}

export default ThemePanel;
