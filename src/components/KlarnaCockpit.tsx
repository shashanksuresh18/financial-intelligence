"use client";

import { useMemo, useState } from "react";

import type {
  DrilldownSection,
  EvidenceItem,
  EvidenceRef,
  EvidenceSource,
  KlarnaCockpitData,
} from "@/lib/klarna-cockpit-data";

type KlarnaCockpitProps = {
  readonly data: KlarnaCockpitData;
};

type EvidenceLookup = {
  readonly item: EvidenceItem;
  readonly source: EvidenceSource;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function formatSourceDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function getSourceAgeTone(date: string): "neutral" | "amber" | "red" {
  const parsed = new Date(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return "neutral";
  }

  const ageDays = Math.floor((Date.now() - parsed.getTime()) / DAY_IN_MS);

  if (ageDays > 180) {
    return "red";
  }

  if (ageDays > 90) {
    return "amber";
  }

  return "neutral";
}

function buildEvidenceLabel(source: EvidenceSource | undefined): string {
  if (source === undefined) {
    return "Source unavailable";
  }

  const rawLabel =
    source.label.trim().length > 0
      ? source.label
      : source.fullName.trim().length > 0
        ? source.fullName
        : source.publisher;
  const label = rawLabel
    .replace(/\bQ[1-4]\s+20\d{2}\b/gi, "")
    .replace(/\bQ[1-4]\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return label.length > 0 ? label : "Source";

}

function getEvidenceChipClassName(source: EvidenceSource): string {
  getSourceAgeTone(source.date);

  return "fi-focus-ring fi-interactive inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-medium leading-none text-[#8B95A7] transition-colors hover:bg-white/[0.07] hover:text-[#CBD5E1]";
}

function EvidenceChip({
  evidence,
  evidenceById,
  onOpen,
}: {
  readonly evidence: EvidenceRef;
  readonly evidenceById: ReadonlyMap<string, EvidenceLookup>;
  readonly onOpen: (id: string) => void;
}) {
  const lookup = evidenceById.get(evidence.id);

  if (lookup === undefined) {
    return (
      <span className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7C8798]">
        [missing evidence]
      </span>
    );
  }

  return (
    <button
      type="button"
      className={getEvidenceChipClassName(lookup.source)}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(evidence.id);
      }}
    >
      {buildEvidenceLabel(lookup.source)}
    </button>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineHtml(text: string): string {
  const parts: string[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(escapeHtml(text.slice(lastIndex, index)));
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(`<strong>${escapeHtml(token.slice(2, -2))}</strong>`);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(`<code>${escapeHtml(token.slice(1, -1))}</code>`);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(`<em>${escapeHtml(token.slice(1, -1))}</em>`);
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);

      if (linkMatch !== null) {
        parts.push(
          `<a href="${escapeHtml(linkMatch[2])}">${escapeHtml(linkMatch[1])}</a>`,
        );
      } else {
        parts.push(escapeHtml(token));
      }
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.slice(lastIndex)));
  }

  return parts.join("");
}

function htmlCell(value: string): string {
  return renderInlineHtml(value.replace(/\r?\n/g, " ").trim());
}

function htmlTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  return [
    "<table>",
    `<thead><tr>${headers.map((header) => `<th>${htmlCell(header)}</th>`).join("")}</tr></thead>`,
    "<tbody>",
    ...rows.map(
      (row) => `<tr>${row.map((cell) => `<td>${htmlCell(cell)}</td>`).join("")}</tr>`,
    ),
    "</tbody>",
    "</table>",
  ].join("\n");
}

function htmlList(items: readonly string[]): string {
  return `<ul>${items.map((item) => `<li>${renderInlineHtml(item)}</li>`).join("")}</ul>`;
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let index = 0;

  const startsBlock = (line: string): boolean => {
    const trimmed = line.trim();

    return (
      trimmed.length === 0 ||
      /^#{1,6}\s+/.test(trimmed) ||
      /^[-*]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed) ||
      trimmed.startsWith("|") ||
      /^-{3,}$/.test(trimmed)
    );
  };

  while (index < lines.length) {
    const trimmed = (lines[index] ?? "").trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);

    if (headingMatch !== null) {
      const level = Math.min(headingMatch[1].length + 1, 6);
      blocks.push(`<h${level}>${renderInlineHtml(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (
      trimmed.startsWith("|") &&
      lines[index + 1] !== undefined &&
      isTableSeparator(lines[index + 1])
    ) {
      const tableLines: string[] = [];

      while (index < lines.length && lines[index]?.trim().startsWith("|")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }

      blocks.push(htmlTable(parseTableRow(tableLines[0] ?? ""), tableLines.slice(2).map(parseTableRow)));
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && /^[-*]\s+/.test(lines[index]?.trim() ?? "")) {
        items.push((lines[index] ?? "").trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }

      blocks.push(htmlList(items));
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index]?.trim() ?? "")) {
        items.push((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push(
        `<ol>${items.map((item) => `<li>${renderInlineHtml(item)}</li>`).join("")}</ol>`,
      );
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length && !startsBlock(lines[index] ?? "")) {
      paragraphLines.push((lines[index] ?? "").trim());
      index += 1;
    }

    blocks.push(`<p>${renderInlineHtml(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

function buildDownloadReportHtml(data: KlarnaCockpitData): string {
  const scores = htmlTable(
    ["Score", "Value", "Detail"],
    data.scores.map((score) => [score.label, score.value, score.detail]),
  );
  const metrics = htmlTable(
    ["Metric", "Value", "Detail"],
    data.metrics.map((metric) => [metric.label, metric.value, metric.detail]),
  );
  const scenarios = htmlTable(
    ["Scenario", "Stance", "Summary", "Range"],
    data.scenarios.map((scenario) => [
      scenario.title,
      scenario.stance,
      scenario.text,
      scenario.range ?? "Not provided",
    ]),
  );
  const thesis = data.thesisCells
    .map(
      (cell) =>
        `<section><h3>${escapeHtml(cell.title)}</h3>${htmlList(cell.bullets.map((bullet) => bullet.text))}</section>`,
    )
    .join("\n");
  const sources = htmlTable(
    ["Source", "Publisher", "Publication date", "Freshness", "Confidence", "URL"],
    data.sources.map((source) => [
      source.fullName,
      source.publisher,
      formatSourceDate(source.date),
      `${source.freshness}/100`,
      `${source.confidence}/100`,
      source.url ?? "Local/static source",
    ]),
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.title)}</title>
  <style>
    body { margin: 0; background: #f7f8fb; color: #172033; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; }
    main { max-width: 1040px; margin: 0 auto; padding: 40px 24px 64px; }
    section { margin-top: 28px; }
    h1 { margin: 0 0 12px; font-size: 34px; line-height: 1.1; }
    h2 { margin: 34px 0 12px; font-size: 22px; border-top: 1px solid #d9deea; padding-top: 22px; }
    h3 { margin: 24px 0 10px; font-size: 17px; }
    p { margin: 10px 0; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin: 18px 0 24px; }
    .meta div, .callout { border: 1px solid #d9deea; border-radius: 10px; background: #ffffff; padding: 14px 16px; }
    .label { display: block; color: #647086; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0 22px; background: #ffffff; border: 1px solid #d9deea; }
    th, td { border: 1px solid #d9deea; padding: 9px 11px; text-align: left; vertical-align: top; }
    th { background: #edf1f7; }
    code { background: #edf1f7; border-radius: 4px; padding: 1px 4px; }
    a { color: #087f6f; }
    hr { border: 0; border-top: 1px solid #d9deea; margin: 34px 0; }
    @media print { body { background: #ffffff; } main { padding: 0; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(data.title)}</h1>
    <div class="meta">
      <div><span class="label">Verdict</span>${escapeHtml(data.verdict)}</div>
      <div><span class="label">Price</span>${escapeHtml(data.livePrice)}</div>
      <div><span class="label">As of</span>${escapeHtml(data.asOfDate)}</div>
      <div><span class="label">Last core source</span>${escapeHtml(data.lastCoreSourceDate)}</div>
    </div>
    <section><h2>Scores</h2>${scores}</section>
    <section><h2>KPI Band</h2>${metrics}</section>
    <section><h2>Core Debate</h2><div class="callout">${renderInlineHtml(data.coreDebate.text)}</div></section>
    <section><h2>Thesis Quadrant</h2>${thesis}</section>
    <section><h2>Scenarios</h2>${scenarios}<p>${escapeHtml(data.scenarioDisclaimer ?? "")}</p></section>
    <section><h2>Missing Data</h2>${htmlList(data.missingData.map((item) => item.label))}</section>
    <section><h2>Next Catalyst</h2><p><strong>${escapeHtml(data.catalyst.headline)} - ${escapeHtml(data.catalyst.date)}</strong></p>${htmlList(data.catalyst.watchItems.map((item) => item.label))}</section>
    <section><h2>Source Library</h2>${sources}</section>
    <hr>
    <section><h2>Full Saved Research Memo</h2>${markdownToHtml(data.rawMarkdown.trim())}</section>
  </main>
</body>
</html>`;
}

function downloadReport(data: KlarnaCockpitData): void {
  const blob = new Blob([buildDownloadReportHtml(data)], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "klarna-investment-cockpit-report.html";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function SectionCard({
  children,
  className = "",
  drilldownId,
  onDrilldown,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly drilldownId?: string;
  readonly onDrilldown?: (id: string) => void;
}) {
  const interactive = drilldownId !== undefined && onDrilldown !== undefined;

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111722] [box-shadow:0_12px_30px_rgba(0,0,0,0.25)] ${interactive ? "fi-card-hover cursor-pointer" : ""} ${className}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={() => {
        if (interactive) {
          onDrilldown(drilldownId);
        }
      }}
      onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onDrilldown(drilldownId);
        }
      }}
    >
      {children}
    </article>
  );
}

function Drawer({
  lookup,
  onClose,
}: {
  readonly lookup: EvidenceLookup | null;
  readonly onClose: () => void;
}) {
  if (lookup === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#070A12]/75 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close evidence drawer"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-white/[0.08] bg-[#0D111B] p-6 [box-shadow:0_12px_30px_rgba(0,0,0,0.25)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#22C7A9]">
              Evidence Source
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#F8FAFC]">
              {lookup.source.fullName}
            </h2>
            <p className="mt-1 text-sm text-[#7C8798]">{lookup.source.publisher}</p>
          </div>
          <button
            type="button"
            className="fi-focus-ring fi-interactive rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8B95A7] hover:bg-white/[0.07] hover:text-[#CBD5E1]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl border border-white/[0.08] bg-[#151B27] p-4">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-[#7C8798]">
              Source full name
            </dt>
            <dd className="mt-1 font-medium text-[#F8FAFC]">
              {lookup.source.fullName}
            </dd>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#151B27] p-4">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-[#7C8798]">
              Publisher
            </dt>
            <dd className="mt-1 font-medium text-[#F8FAFC]">
              {lookup.source.publisher}
            </dd>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#151B27] p-4">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-[#7C8798]">
              Publication date
            </dt>
            <dd className="mt-1 font-medium text-[#F8FAFC]">
              {formatSourceDate(lookup.source.date)}
            </dd>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#151B27] p-4">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-[#7C8798]">
              Freshness score
            </dt>
            <dd className="mt-1 font-medium text-[#22C7A9]">
              {lookup.source.freshness}/100
            </dd>
            <dd className="mt-1 text-xs leading-5 text-[#7C8798]">
              Recency of the source relative to the cockpit as-of date.
            </dd>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#151B27] p-4">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-[#7C8798]">
              Confidence score
            </dt>
            <dd className="mt-1 font-medium text-[#F8FAFC]">
              {lookup.source.confidence}/100
            </dd>
            <dd className="mt-1 text-xs leading-5 text-[#7C8798]">
              Reliability of the source type for this specific claim.
            </dd>
          </div>
        </dl>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#151B27] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7C8798]">
            Extracted Line
          </p>
          <p className="mt-3 text-sm leading-6 text-[#CBD5E1]">{lookup.item.quote}</p>
        </div>

        {lookup.source.url !== undefined ? (
          <a
            href={lookup.source.url}
            target="_blank"
            rel="noreferrer"
            className="fi-focus-ring fi-interactive mt-5 inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#CBD5E1] hover:bg-white/[0.07] hover:text-[#F8FAFC]"
          >
            Open direct source
          </a>
        ) : (
          <p className="mt-5 rounded-2xl border border-white/[0.08] bg-[#151B27] p-4 text-xs leading-5 text-[#7C8798]">
            No direct source URL is available for this saved plugin run or
            static prototype fallback.
          </p>
        )}
      </aside>
    </div>
  );
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`${index}-strong`} className="font-semibold text-[#F8FAFC]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={`${index}-code`}
          className="rounded bg-[#151B27] px-1 py-0.5 font-mono text-[0.9em] text-[#22C7A9]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={`${index}-em`} className="text-[#CBD5E1]">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);

      if (linkMatch !== null) {
        parts.push(
          <a
            key={`${index}-link`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-[#22C7A9] underline decoration-[#22C7A9]/40 underline-offset-4 hover:text-[#F8FAFC]"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function MarkdownRenderer({ content }: { readonly content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let index = 0;

  const startsBlock = (line: string): boolean => {
    const trimmed = line.trim();

    return (
      trimmed.length === 0 ||
      /^#{1,6}\s+/.test(trimmed) ||
      /^[-*]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed) ||
      trimmed.startsWith("|") ||
      /^-{3,}$/.test(trimmed)
    );
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${index}`} className="border-white/[0.08]" />);
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);

    if (headingMatch !== null) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const className =
        level <= 2
          ? "text-xl font-semibold text-[#F8FAFC]"
          : "text-base font-semibold text-[#F8FAFC]";

      blocks.push(
        <h3 key={`heading-${index}`} className={className}>
          {renderInlineMarkdown(text)}
        </h3>,
      );
      index += 1;
      continue;
    }

    if (
      trimmed.startsWith("|") &&
      lines[index + 1] !== undefined &&
      isTableSeparator(lines[index + 1])
    ) {
      const tableLines: string[] = [];

      while (index < lines.length && lines[index]?.trim().startsWith("|")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }

      const header = parseTableRow(tableLines[0] ?? "");
      const body = tableLines.slice(2).map(parseTableRow);

      blocks.push(
        <div
          key={`table-${index}`}
          className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#151B27]"
        >
          <table className="min-w-full border-collapse text-left text-xs text-[#CBD5E1]">
            <thead className="bg-[#111722] text-[#F8FAFC]">
              <tr>
                {header.map((cell, cellIndex) => (
                  <th
                    key={`${cell}-${cellIndex}`}
                    className="border-b border-white/[0.08] px-3 py-2 font-semibold"
                  >
                    {renderInlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="border-t border-white/[0.06]">
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2">
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && /^[-*]\s+/.test(lines[index]?.trim() ?? "")) {
        items.push((lines[index] ?? "").trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${index}`} className="list-disc space-y-2 pl-5 text-sm text-[#CBD5E1]">
          {items.map((item) => (
            <li key={item}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index]?.trim() ?? "")) {
        items.push((lines[index] ?? "").trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ol
          key={`ol-${index}`}
          className="list-decimal space-y-2 pl-5 text-sm text-[#CBD5E1]"
        >
          {items.map((item) => (
            <li key={item}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];

    while (index < lines.length && !startsBlock(lines[index] ?? "")) {
      paragraphLines.push((lines[index] ?? "").trim());
      index += 1;
    }

    blocks.push(
      <p key={`p-${index}`} className="text-sm leading-6 text-[#CBD5E1]">
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>,
    );
  }

  return <div className="max-h-[520px] space-y-4 overflow-auto">{blocks}</div>;
}

function DrilldownPanel({
  section,
  onClose,
}: {
  readonly section: DrilldownSection | null;
  readonly onClose: () => void;
}) {
  if (section === null) {
    return null;
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-[1400px] rounded-[20px] border border-white/[0.08] bg-[#0D111B] p-6 [box-shadow:0_12px_30px_rgba(0,0,0,0.25)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7C8798]">
            Drill-down
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[#F8FAFC]">{section.title}</h2>
        </div>
        <button
          type="button"
          className="fi-focus-ring fi-interactive rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8B95A7] hover:bg-white/[0.07] hover:text-[#CBD5E1]"
          onClick={onClose}
        >
          Collapse
        </button>
      </div>
      <div className="rounded-2xl border border-white/[0.08] bg-[#111722] p-5">
        <MarkdownRenderer content={section.content} />
      </div>
    </section>
  );
}

export default function KlarnaCockpit({ data }: KlarnaCockpitProps) {
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [activeDrilldownId, setActiveDrilldownId] = useState<string | null>(null);

  const evidenceById = useMemo(() => {
    const sourceById = new Map(data.sources.map((source) => [source.id, source]));
    const map = new Map<string, EvidenceLookup>();

    for (const item of data.evidence) {
      const source = sourceById.get(item.sourceId);

      if (source !== undefined) {
        map.set(item.id, { item, source });
      }
    }

    return map;
  }, [data.evidence, data.sources]);

  const activeEvidence =
    activeEvidenceId === null ? null : evidenceById.get(activeEvidenceId) ?? null;
  const activeDrilldown =
    activeDrilldownId === null
      ? null
      : data.drilldowns.find((section) => section.id === activeDrilldownId) ?? null;

  return (
    <main
      className="min-h-screen p-6 text-[#CBD5E1]"
      style={{
        background:
          "radial-gradient(circle at top left, rgba(34,199,169,0.07), transparent 30%), radial-gradient(circle at top right, rgba(245,197,66,0.05), transparent 34%), #070A12",
      }}
    >
      <section className="mx-auto grid w-full max-w-[1400px] grid-rows-[auto_auto_auto_auto_auto_auto] gap-5">
        <header className="rounded-[20px] border border-white/[0.08] bg-[#0D111B] p-5 [box-shadow:0_12px_30px_rgba(0,0,0,0.25)]">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7C8798]">
                Klarna-only prototype
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#F8FAFC]">
                {data.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[rgba(245,197,66,0.45)] bg-[rgba(245,197,66,0.12)] px-3 py-1 text-sm font-semibold uppercase tracking-[0.14em] text-[#F5C542] [box-shadow:0_0_28px_rgba(245,197,66,0.08)]">
                  {data.verdict}
                </span>
                <EvidenceChip
                  evidence={{ id: "verdict" }}
                  evidenceById={evidenceById}
                  onOpen={setActiveEvidenceId}
                />
                <button
                  type="button"
                  className="fi-focus-ring fi-interactive rounded-full border border-[rgba(245,197,66,0.35)] bg-[rgba(245,197,66,0.12)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#F5C542] hover:border-[rgba(245,197,66,0.55)] hover:bg-[rgba(245,197,66,0.16)]"
                  onClick={() => downloadReport(data)}
                >
                  Download HTML report
                </button>
              </div>
            </div>

            <div className="grid min-w-[520px] grid-cols-4 gap-4">
              {data.scores.map((score) => (
                <div
                  key={score.label}
                  className={`rounded-2xl border p-[18px_20px] ${
                    score.label === "Conviction"
                      ? "border-[rgba(245,197,66,0.35)] bg-[rgba(245,197,66,0.12)]"
                      : "border-white/[0.08] bg-[#151B27]"
                  }`}
                >
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#7C8798]">
                    {score.label}
                  </p>
                  <p
                    className={`mt-1 text-lg font-semibold ${
                      score.label === "Conviction" ? "text-[#F5C542]" : "text-[#F8FAFC]"
                    }`}
                  >
                    {score.value}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#7C8798]">
                    {score.detail}
                  </p>
                </div>
              ))}
              <div className="rounded-2xl border border-[rgba(34,199,169,0.28)] bg-[rgba(34,199,169,0.12)] p-[18px_20px]">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#22C7A9]">
                  Price
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-[#22C7A9]">{data.livePrice}</p>
                  {data.livePriceStatus === "live" ? (
                    <span className="rounded-full border border-[rgba(34,199,169,0.45)] bg-[rgba(34,199,169,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#22C7A9]">
                      Live
                    </span>
                  ) : null}
                </div>
                <div className="mt-1">
                  <EvidenceChip
                    evidence={{ id: "static-price" }}
                    evidenceById={evidenceById}
                    onOpen={setActiveEvidenceId}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-[#7C8798]">
            <span>As of {data.asOfDate}</span>
            <span>Last core source {data.lastCoreSourceDate}</span>
            <span>Executive summary is shown below.</span>
          </div>
        </header>

        <section className="rounded-[20px] border border-[rgba(34,199,169,0.22)] bg-[#0D111B] p-5 [box-shadow:0_12px_30px_rgba(0,0,0,0.25)]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#22C7A9]">
                Summary
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[#F8FAFC]">
                {data.executiveSummary.title}
              </h2>
            </div>
            <button
              type="button"
              className="fi-focus-ring fi-interactive rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#8B95A7] hover:bg-white/[0.07] hover:text-[#CBD5E1]"
              onClick={() => setActiveDrilldownId(data.executiveSummary.id)}
            >
              Open
            </button>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111722] p-5">
            <MarkdownRenderer content={data.executiveSummary.content} />
          </div>
        </section>

        <div className="grid grid-cols-5 gap-5">
          {data.metrics.map((metric) => (
            <SectionCard
              key={metric.label}
              className="p-[18px_20px]"
              drilldownId={metric.drilldownId}
              onDrilldown={setActiveDrilldownId}
            >
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#7C8798]">
                {metric.label}
              </p>
              <p className="mt-2 text-[28px] font-bold tracking-[-0.02em] text-[#F8FAFC]">{metric.value}</p>
              <p className="mt-2 min-h-9 text-xs leading-5 text-[#7C8798]">
                {metric.detail}
              </p>
              <div className="mt-2">
                <EvidenceChip
                  evidence={metric.evidence}
                  evidenceById={evidenceById}
                  onOpen={setActiveEvidenceId}
                />
              </div>
            </SectionCard>
          ))}
        </div>

        <SectionCard
          className="border-[rgba(245,197,66,0.28)] bg-[#111722] p-[18px_20px]"
          drilldownId={data.coreDebate.drilldownId}
          onDrilldown={setActiveDrilldownId}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F5C542]">
            Core Debate
          </p>
          <p className="mt-3 text-lg font-semibold leading-7 text-[#F8FAFC]">
            {data.coreDebate.text}
          </p>
          <p className="mt-3 text-xs leading-5 text-[#7C8798]">
            IFRS 9 expected credit losses stay separate from adjusted profit.
            FY2025 IFRS net loss was $(273)m; do not blend that away.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <EvidenceChip
              evidence={data.coreDebate.evidence}
              evidenceById={evidenceById}
              onOpen={setActiveEvidenceId}
            />
            <EvidenceChip
              evidence={{ id: "ifrs-loss" }}
              evidenceById={evidenceById}
              onOpen={setActiveEvidenceId}
            />
          </div>
        </SectionCard>

        <div className="grid grid-cols-2 gap-5">
          {data.thesisCells.map((cell) => (
            <SectionCard
              key={cell.id}
              className={`p-[18px_20px] ${
                cell.eyebrow !== undefined
                  ? "border-[rgba(245,197,66,0.35)] bg-[rgba(245,197,66,0.08)]"
                  : ""
              }`}
              drilldownId={cell.drilldownId}
              onDrilldown={setActiveDrilldownId}
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  {cell.eyebrow !== undefined ? (
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F5C542]">
                      {cell.eyebrow}
                    </p>
                  ) : null}
                  <h2 className="text-sm font-semibold text-[#F8FAFC]">{cell.title}</h2>
                </div>
              </div>
              <ul className="space-y-2">
                {cell.bullets.map((bullet) => (
                  <li key={bullet.text} className="text-xs leading-5 text-[#CBD5E1]">
                    <span className="line-clamp-2">{bullet.text}</span>
                    <span className="ml-2 inline-flex">
                      <EvidenceChip
                        evidence={bullet.evidence}
                        evidenceById={evidenceById}
                        onOpen={setActiveEvidenceId}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>

        <div>
          <div className="grid grid-cols-4 gap-5">
            {data.scenarios.map((scenario) => (
              <SectionCard
                key={scenario.title}
                className="p-[18px_20px]"
                drilldownId={scenario.drilldownId}
                onDrilldown={setActiveDrilldownId}
              >
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#7C8798]">
                  {scenario.title}
                </p>
                <h3 className="mt-1 text-sm font-semibold text-[#F8FAFC]">
                  {scenario.stance}
                </h3>
                {scenario.range !== undefined ? (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#F5C542]">
                    Range: {scenario.range}
                  </p>
                ) : null}
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#7C8798]">
                  {scenario.text}
                </p>
                <div className="mt-2">
                  <EvidenceChip
                    evidence={scenario.evidence}
                    evidenceById={evidenceById}
                    onOpen={setActiveEvidenceId}
                  />
                </div>
              </SectionCard>
            ))}
          </div>
          {data.scenarioDisclaimer !== undefined ? (
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F5C542]">
              {data.scenarioDisclaimer}
            </p>
          ) : null}
        </div>

        <footer className="grid grid-cols-[1fr_1.4fr] gap-5 rounded-[20px] border border-white/[0.08] bg-[#0D111B] p-5 [box-shadow:0_12px_30px_rgba(0,0,0,0.25)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F87171]">
              Missing Data Blocking Conviction
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.missingData.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`fi-focus-ring fi-interactive rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                    item.tone === "red"
                      ? "border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.12)] text-[#F87171]"
                      : "border-[rgba(245,197,66,0.35)] bg-[rgba(245,197,66,0.12)] text-[#F5C542]"
                  }`}
                  onClick={() => setActiveEvidenceId(item.evidence.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-[#7C8798]">
              The plugin run could not access the webcast and did not parse the
              XLSX. Those gaps stay visible here.
            </p>
          </div>

          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#22C7A9]">
                  Next Catalyst
                </p>
                <h2 className="mt-1 text-xl font-semibold text-[#F8FAFC]">
                  {data.catalyst.headline} - {data.catalyst.date}
                </h2>
              </div>
              <EvidenceChip
                evidence={data.catalyst.evidence}
                evidenceById={evidenceById}
                onOpen={setActiveEvidenceId}
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {data.catalyst.watchItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="fi-focus-ring fi-interactive rounded-2xl border border-white/[0.08] bg-[#151B27] p-[14px_16px] text-left text-xs leading-5 text-[#CBD5E1] hover:border-[rgba(34,199,169,0.35)] hover:bg-[rgba(34,199,169,0.12)]"
                  onClick={() => setActiveEvidenceId(item.evidence.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </section>

      <DrilldownPanel
        section={activeDrilldown}
        onClose={() => setActiveDrilldownId(null)}
      />
      <Drawer lookup={activeEvidence} onClose={() => setActiveEvidenceId(null)} />
    </main>
  );
}
