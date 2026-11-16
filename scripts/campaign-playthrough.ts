import { CampaignGame } from "../src/campaign-game.ts";
import { solveRound, prepareRound } from "../src/developer.ts";
import { serialize } from "../src/save.ts";
import { campaign } from "../src/campaign.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const g = new CampaignGame();
const scenarios: Record<number, string> = {};
let received = 0;
let sent = 0;
let ledgerStart = g.ledger.length;
while (g.status !== "won") {
  scenarios[g.round] = serialize(g);
  if (process.env.PIXELHUB_CHECKPOINTS) {
    mkdirSync("artifacts/checkpoints", { recursive: true });
    writeFileSync(
      "artifacts/checkpoints/round-" + g.round + ".json",
      scenarios[g.round],
    );
  }
  const start = performance.now();
  await solveRound(g);
  const report = g.roundReport();
  received += report.received;
  sent += report.sent;
  const investments = -g.ledger
    .slice(ledgerStart)
    .reduce((sum, entry) => sum + (entry.investment ? entry.amount : 0), 0);
  ledgerStart = g.ledger.length;
  console.log(
    JSON.stringify({
      round: g.round,
      stock: g.stock.length,
      cash: g.cash,
      received: report.received,
      sent: report.sent,
      revenue: report.totalRevenue,
      costs: report.totalCosts,
      investments,
      seconds: (performance.now() - start) / 1000,
    }),
  );
  if (g.status !== "won") prepareRound(g);
}
if (received !== 1010 || sent !== 1010 || g.stock.length !== 0)
  throw new Error(
    "Kampania musi zakończyć się fizycznym bilansem 1010/1010 i pustym magazynem.",
  );
if (process.argv.includes("--fixtures")) {
  mkdirSync("public", { recursive: true });
  writeFileSync(
    "public/campaign-scenarios.json.gz",
    gzipSync(
      JSON.stringify({
        version: 9,
        campaign: JSON.stringify(campaign),
        scenarios,
      }),
      { level: 9 },
    ),
  );
}
