import { CampaignGame } from "../src/campaign-game.ts";
import { solveRound } from "../src/developer.ts";
import { serialize } from "../src/save.ts";
import { campaign } from "../src/campaign.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const g = new CampaignGame();
const scenarios: Record<number, string> = {};
while (g.status !== "won") {
  scenarios[g.round] = serialize(g);
  const start = performance.now();
  await solveRound(g);
  console.log(
    JSON.stringify({
      round: g.round,
      stock: g.stock.length,
      cash: g.cash,
      seconds: (performance.now() - start) / 1000,
    }),
  );
  g.nextRound();
}
if (process.argv.includes("--fixtures")) {
  mkdirSync("public", { recursive: true });
  writeFileSync(
    "public/campaign-scenarios.json.gz",
    gzipSync(
      JSON.stringify({
        version: 2,
        campaign: JSON.stringify(campaign),
        scenarios,
      }),
      { level: 9 },
    ),
  );
}
