export async function getClaudeFallbackNarrative(
  query: string,
): Promise<string> {
  return `Placeholder fallback narrative for ${query || "the selected company"}.`;
}

export const claudeFallbackDatasource = {
  name: "claude-fallback",
  generate: getClaudeFallbackNarrative,
};

export default claudeFallbackDatasource;
