import { mkdir, writeFile } from "node:fs/promises";
import { request } from "node:http";

const endpoint = new URL(
  process.env.ANALYZE_ENDPOINT ?? "http://localhost:3000/api/analyze",
);

const companies = [
  ["Apple", "apple"],
  ["NVIDIA", "nvidia"],
  ["Microsoft", "microsoft"],
  ["Diageo", "diageo"],
  ["Compass Group", "compass-group"],
  ["Klarna", "klarna"],
  ["Stripe", "stripe"],
  ["Greggs", "greggs"],
  ["Rolls-Royce", "rolls-royce"],
  ["Snowflake", "snowflake"],
];

function postAnalyze(company) {
  const payload = JSON.stringify({ company, forceRefresh: true });

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port || 80,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            reject(
              new Error(
                `Unexpected non-JSON response for ${company}: HTTP ${res.statusCode} ${body.slice(0, 500)}`,
              ),
            );
            return;
          }

          if ((res.statusCode ?? 500) >= 400 || parsed.ok !== true) {
            reject(
              new Error(
                `Analyze failed for ${company}: HTTP ${res.statusCode} ${JSON.stringify(parsed).slice(0, 500)}`,
              ),
            );
            return;
          }

          resolve(parsed);
        });
      },
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

await mkdir("eval/after", { recursive: true });

for (const [company, slug] of companies) {
  const startedAt = Date.now();
  console.log(`[refresh] ${company}...`);
  const response = await postAnalyze(company);
  await writeFile(
    `eval/after/${slug}.json`,
    `${JSON.stringify(response, null, 2)}\n`,
  );
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[refresh] ${company} saved to eval/after/${slug}.json (${seconds}s)`);
}

console.log("[refresh] complete");
