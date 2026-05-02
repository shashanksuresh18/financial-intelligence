import type {
  DiligenceCheckField,
  DiligenceCheckItem,
  DiligenceChecklist,
  EvidenceAnchor,
  FinancialMetric,
  WaterfallResult,
} from "@/lib/types";

type CheckDefinition = {
  readonly field: DiligenceCheckField;
  readonly label: string;
  readonly isCritical: boolean;
};

const CHECK_DEFINITIONS: readonly CheckDefinition[] = [
  { field: "revenue-verified", label: "Revenue Verified", isCritical: true },
  { field: "gross-margin-verified", label: "Gross Margin Verified", isCritical: true },
  { field: "retention-verified", label: "Retention / NDR Verified", isCritical: false },
  { field: "concentration-verified", label: "Customer Concentration Assessed", isCritical: false },
  { field: "round-terms-reviewed", label: "Round Terms Reviewed", isCritical: false },
  { field: "governance-understood", label: "Governance Understood", isCritical: false },
  { field: "unit-economics-understood", label: "Unit Economics Understood", isCritical: false },
];

function findMetric(
  metrics: readonly FinancialMetric[],
  ...labels: readonly string[]
): FinancialMetric | null {
  for (const label of labels) {
    const metric = metrics.find(
      (m) => m.label.toLowerCase() === label.toLowerCase() && m.value !== null,
    );
    if (metric !== undefined) return metric;
  }
  return null;
}

function findAnchor(
  anchors: readonly EvidenceAnchor[],
  ...labels: readonly string[]
): EvidenceAnchor | null {
  for (const label of labels) {
    const anchor = anchors.find(
      (a) => a.label.toLowerCase().includes(label.toLowerCase()),
    );
    if (anchor !== undefined) return anchor;
  }
  return null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function metricEvidenceId(metric: FinancialMetric | null): string | null {
  if (metric === null || metric.source === undefined || metric.value === null) {
    return null;
  }

  return `${metric.source}:${slugify(metric.label)}`;
}

function sourceEvidenceId(
  waterfallResult: WaterfallResult,
  sourceKey: keyof Pick<WaterfallResult, "exaDeep" | "companiesHouse" | "gleif">,
  label: string,
): string | null {
  const result = waterfallResult[sourceKey];
  return result === null ? null : `${result.source}:${slugify(label)}`;
}

function resolveEvidenceId(
  anchors: readonly EvidenceAnchor[],
  metric: FinancialMetric | null,
  fallbackId: string | null,
  ...anchorLabels: readonly string[]
): string | null {
  return findAnchor(anchors, ...anchorLabels)?.id ?? metricEvidenceId(metric) ?? fallbackId;
}

function checkRevenueVerified(
  metrics: readonly FinancialMetric[],
  anchors: readonly EvidenceAnchor[],
  waterfallResult: WaterfallResult,
): Omit<DiligenceCheckItem, "field" | "label" | "isCritical"> {
  const revenueMetric = findMetric(metrics, "Revenue", "Estimated Revenue");
  const exaDeep = waterfallResult.exaDeep?.data ?? null;

  if (revenueMetric !== null) {
    const eClass = revenueMetric.evidenceClass;
    if (eClass !== undefined && eClass !== null && eClass !== "model-inference") {
      return {
        status: "verified",
        evidenceId: resolveEvidenceId(anchors, revenueMetric, null, "Revenue"),
        note: `Revenue figure backed by ${eClass} evidence.`,
      };
    }
    return {
      status: "estimated",
      evidenceId: resolveEvidenceId(anchors, revenueMetric, null, "Revenue", "Estimated Revenue"),
      note: "Revenue figure present but sourced from synthesized web or model inference.",
    };
  }

  if (exaDeep?.estimatedRevenue !== null && exaDeep?.estimatedRevenue !== undefined) {
    return {
      status: "estimated",
      evidenceId:
        findAnchor(anchors, "Estimated Revenue")?.id ??
        sourceEvidenceId(waterfallResult, "exaDeep", "estimated-revenue"),
      note: `Exa Deep surfaced estimated revenue of ${exaDeep.estimatedRevenue}.`,
    };
  }

  return {
    status: "missing",
    evidenceId: null,
    note: "No revenue evidence is available in the current data set.",
  };
}

function checkGrossMarginVerified(
  metrics: readonly FinancialMetric[],
  anchors: readonly EvidenceAnchor[],
  waterfallResult: WaterfallResult,
): Omit<DiligenceCheckItem, "field" | "label" | "isCritical"> {
  const marginMetric = findMetric(metrics, "Gross Margin");

  if (marginMetric !== null) {
    return {
      status: "verified",
      evidenceId: resolveEvidenceId(anchors, marginMetric, null, "Gross Margin"),
      note: "Gross margin metric is present in the structured data.",
    };
  }

  const exaOverview = waterfallResult.exaDeep?.data.overview ?? "";
  if (exaOverview.toLowerCase().includes("margin")) {
    return {
      status: "estimated",
      evidenceId: sourceEvidenceId(waterfallResult, "exaDeep", "margin-mention"),
      note: "Exa Deep overview mentions margin but no structured metric is available.",
    };
  }

  return {
    status: "missing",
    evidenceId: null,
    note: "No gross margin evidence is available.",
  };
}

function checkRetentionVerified(
  metrics: readonly FinancialMetric[],
  anchors: readonly EvidenceAnchor[],
): Omit<DiligenceCheckItem, "field" | "label" | "isCritical"> {
  const retentionMetric = findMetric(
    metrics,
    "NDR",
    "Net Dollar Retention",
    "Net Revenue Retention",
    "Retention Rate",
  );

  if (retentionMetric !== null) {
    return {
      status: "verified",
      evidenceId: resolveEvidenceId(anchors, retentionMetric, null, "NDR", "Retention"),
      note: "Retention or NDR metric is present.",
    };
  }

  return {
    status: "missing",
    evidenceId: null,
    note: "No retention or NDR metric is available — rarely surfaced for private companies.",
  };
}

function checkConcentrationVerified(
  waterfallResult: WaterfallResult,
): Omit<DiligenceCheckItem, "field" | "label" | "isCritical"> {
  const competitors = waterfallResult.exaDeep?.data.competitors ?? [];

  if (competitors.length > 0) {
    return {
      status: "estimated",
      evidenceId: sourceEvidenceId(waterfallResult, "exaDeep", "competitors"),
      note: `Exa Deep identifies ${competitors.length} competitor(s), providing partial concentration context.`,
    };
  }

  return {
    status: "missing",
    evidenceId: null,
    note: "No competitor or concentration data is available.",
  };
}

function checkRoundTermsReviewed(
  waterfallResult: WaterfallResult,
): Omit<DiligenceCheckItem, "field" | "label" | "isCritical"> {
  const exaDeep = waterfallResult.exaDeep?.data ?? null;
  const hasFunding = exaDeep?.fundingTotal !== null && exaDeep?.fundingTotal !== undefined;
  const hasValuation = exaDeep?.lastValuation !== null && exaDeep?.lastValuation !== undefined;

  if (hasFunding || hasValuation) {
    const parts = [
      hasFunding ? `funding totals ${exaDeep!.fundingTotal}` : null,
      hasValuation ? `last valuation ${exaDeep!.lastValuation}` : null,
    ].filter((p): p is string => p !== null);
    return {
      status: "estimated",
      evidenceId: sourceEvidenceId(waterfallResult, "exaDeep", "round-terms"),
      note: `Round terms partially reviewed: ${parts.join(", ")}.`,
    };
  }

  return {
    status: "missing",
    evidenceId: null,
    note: "No funding round or valuation evidence is available.",
  };
}

function checkGovernanceUnderstood(
  waterfallResult: WaterfallResult,
): Omit<DiligenceCheckItem, "field" | "label" | "isCritical"> {
  if (waterfallResult.gleif !== null) {
    return {
      status: "estimated",
      evidenceId: sourceEvidenceId(waterfallResult, "gleif", "legal-entity-record"),
      note: "GLEIF legal entity record is present.",
    };
  }

  if (waterfallResult.companiesHouse !== null) {
    return {
      status: "estimated",
      evidenceId: sourceEvidenceId(waterfallResult, "companiesHouse", "registry-record"),
      note: "Companies House registry record is present.",
    };
  }

  return {
    status: "missing",
    evidenceId: null,
    note: "No governance or registry data is available.",
  };
}

function checkUnitEconomicsUnderstood(
  metrics: readonly FinancialMetric[],
  anchors: readonly EvidenceAnchor[],
): Omit<DiligenceCheckItem, "field" | "label" | "isCritical"> {
  const unitEconMetric = findMetric(
    metrics,
    "CAC",
    "LTV",
    "Contribution Margin",
    "CAC Payback",
    "Customer Acquisition Cost",
  );

  if (unitEconMetric !== null) {
    return {
      status: "verified",
      evidenceId: resolveEvidenceId(
        anchors,
        unitEconMetric,
        null,
        "CAC",
        "LTV",
        "Contribution Margin",
      ),
      note: "Unit economics metric is present in the structured data.",
    };
  }

  return {
    status: "missing",
    evidenceId: null,
    note: "No unit economics metrics (CAC, LTV, contribution margin) are available.",
  };
}

type CheckFn = (
  metrics: readonly FinancialMetric[],
  anchors: readonly EvidenceAnchor[],
  waterfallResult: WaterfallResult,
) => Omit<DiligenceCheckItem, "field" | "label" | "isCritical">;

const CHECK_FUNCTIONS: Record<DiligenceCheckField, CheckFn> = {
  "revenue-verified": checkRevenueVerified,
  "gross-margin-verified": checkGrossMarginVerified,
  "retention-verified": (metrics, anchors) => checkRetentionVerified(metrics, anchors),
  "concentration-verified": (_m, _a, w) => checkConcentrationVerified(w),
  "round-terms-reviewed": (_m, _a, w) => checkRoundTermsReviewed(w),
  "governance-understood": (_m, _a, w) => checkGovernanceUnderstood(w),
  "unit-economics-understood": (metrics, anchors) => checkUnitEconomicsUnderstood(metrics, anchors),
};

export function buildDiligenceChecklist(
  metrics: readonly FinancialMetric[],
  waterfallResult: WaterfallResult,
  evidenceAnchors: readonly EvidenceAnchor[],
): DiligenceChecklist {
  const items: DiligenceCheckItem[] = CHECK_DEFINITIONS.map((def) => {
    const checkFn = CHECK_FUNCTIONS[def.field];
    const result = checkFn(metrics, evidenceAnchors, waterfallResult);
    return {
      field: def.field,
      label: def.label,
      isCritical: def.isCritical,
      ...result,
    };
  });

  const passCount = items.filter((i) => i.status !== "missing").length;
  const criticalMissingCount = items.filter(
    (i) => i.isCritical && i.status === "missing",
  ).length;
  const gaps = items
    .filter((i) => i.status === "missing")
    .map((i) => `${i.label}: ${i.note}`);
  const byField = new Map(items.map((item) => [item.field, item]));
  const getItem = (field: DiligenceCheckField): DiligenceCheckItem => {
    const item = byField.get(field);
    if (item === undefined) {
      throw new Error(`Missing diligence checklist item: ${field}`);
    }
    return item;
  };

  return {
    revenueVerified: getItem("revenue-verified"),
    grossMarginVerified: getItem("gross-margin-verified"),
    retentionVerified: getItem("retention-verified"),
    concentrationVerified: getItem("concentration-verified"),
    roundTermsReviewed: getItem("round-terms-reviewed"),
    governanceUnderstood: getItem("governance-understood"),
    unitEconomicsUnderstood: getItem("unit-economics-understood"),
    items,
    passCount,
    totalCount: items.length,
    criticalMissingCount,
    blockThesis: criticalMissingCount > 0,
    underwritingReady: passCount >= 5 && criticalMissingCount === 0,
    gaps,
  };
}

/** Human-readable summary of the diligence state for thesis override. */
export function diligenceBlockedThesisText(checklist: DiligenceChecklist): string {
  const criticalMissing = checklist.items
    .filter((i) => i.isCritical && i.status === "missing")
    .map((i) => i.label);

  if (criticalMissing.length === 0) {
    return "Primary diligence is incomplete but no critical checks are unresolved.";
  }

  return `Primary diligence required. ${criticalMissing.length} critical check${criticalMissing.length > 1 ? "s are" : " is"} unresolved: ${criticalMissing.join(", ")}.`;
}
