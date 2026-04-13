import type { ResearchNoteSection } from "@/lib/types";

export const NARRATIVE_SECTION_TITLES = [
  "Executive Summary",
  "Company Overview",
  "Financial Analysis",
  "Valuation",
  "Street Consensus",
  "Risk Factors",
  "Catalysts & Outlook",
] as const;

function toHeadingText(title: string): string {
  return title.toUpperCase();
}

function normalizeHeadingCandidate(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .replace(/:+$/, "")
    .trim()
    .toUpperCase();
}

export function parseNarrativeSections(text: string): readonly ResearchNoteSection[] {
  const sections: ResearchNoteSection[] = [];
  const lines = text.split(/\r?\n/);
  let currentTitle: ResearchNoteSection["title"] | null = null;
  let bodyLines: string[] = [];

  const flushSection = () => {
    if (currentTitle === null) {
      bodyLines = [];
      return;
    }

    const body = bodyLines.join("\n").trim();

    if (body.length > 0) {
      sections.push({
        title: currentTitle,
        body,
      });
    }

    bodyLines = [];
  };

  for (const line of lines) {
    const matchedTitle = NARRATIVE_SECTION_TITLES.find(
      (title) => toHeadingText(title) === normalizeHeadingCandidate(line),
    );

    if (matchedTitle !== undefined) {
      flushSection();
      currentTitle = matchedTitle;
      continue;
    }

    bodyLines.push(line);
  }

  flushSection();

  if (sections.length > 0) {
    return sections;
  }

  const fallbackBody = text.trim();

  return fallbackBody.length === 0
    ? []
    : [
      {
        title: "Analyst Brief",
        body: fallbackBody,
      },
    ];
}

export function buildNarrativeSummary(
  narrative: string,
  sections: readonly ResearchNoteSection[],
): string {
  const executiveSummary =
    sections.find((section) => section.title === "Executive Summary")?.body ?? "";
  const summarySource = executiveSummary.trim().length > 0 ? executiveSummary : narrative;
  const trimmed = summarySource.trim();

  return trimmed.length === 0 ? "No analysis data available." : trimmed.slice(0, 220);
}

