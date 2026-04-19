export const DEMO_COMPANIES = [
  "Apple",
  "Microsoft",
  "NVIDIA",
  "Tesla",
  "Deutsche Bank",
  "Klarna",
  "Stripe",
  "SpaceX",
  "Anthropic",
] as const;

export const DEMO_THEMES = [
  "EV charging infrastructure",
  "BNPL payments",
  "AI inference chips",
  "Generative AI enterprise",
  "Defense tech",
] as const;

export type DemoCompany = (typeof DEMO_COMPANIES)[number];
export type DemoTheme = (typeof DEMO_THEMES)[number];
