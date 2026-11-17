import { CampaignGame } from "../src/campaign-game.ts";
import { solveRound, prepareRound } from "../src/developer.ts";
import { serialize } from "../src/save.ts";
import { campaign } from "../src/campaign.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { storyCampaign } from "../src/story-campaign.ts";
const story = process.argv.includes("--story");
const g = new CampaignGame(story);
const scenarios: Record<number, string> = {};
const expected = story ? 1018 : 1010;
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
if (received !== expected || sent !== expected || g.stock.length !== 0)
  throw new Error(
    `Kampania musi zakończyć się fizycznym bilansem ${expected}/${expected} i pustym magazynem.`,
  );
if (story) {
  if (!g.beginDevelopment()) throw Error("Nie można kontynuować po finale");
  g.nextRound();
  scenarios[31] = serialize(g);
  await solveRound(g);
  if (g.round !== 31 || g.status !== "summary")
    throw Error("Runda 31 nie została rozliczona");
  console.log(
    JSON.stringify({ round: 31, stock: g.stock.length, cash: g.cash }),
  );
}
if (process.argv.includes("--fixtures")) {
  mkdirSync("public", { recursive: true });
  writeFileSync(
    story
      ? "public/story-scenarios.json.gz"
      : "public/campaign-scenarios.json.gz",
    gzipSync(
      JSON.stringify({
        version: story ? 10 : 9,
        campaign: JSON.stringify(story ? storyCampaign : campaign),
        scenarios,
      }),
      { level: 9 },
    ),
  );
}
