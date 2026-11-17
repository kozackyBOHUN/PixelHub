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
let contractPallets = 0;
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
  if (g.status !== "won") {
    if (story)
      for (const offer of g
        .offers(g.round + 1)
        .filter((offer) => offer.type !== "story")) {
        if (g.decideContract(offer.id, true))
          contractPallets += offer.pallets.length;
      }
    prepareRound(g);
  }
}
if (
  received !== expected + contractPallets ||
  sent !== expected + contractPallets ||
  g.stock.length !== 0
)
  throw new Error(
    `Kampania musi zakończyć się fizycznym bilansem ${expected}/${expected} i pustym magazynem.`,
  );
if (story) {
  for (let round = 31; round <= 35; round++) {
    if (!g.beginDevelopment()) throw Error("Nie można kontynuować po finale");
    g.nextRound();
    scenarios[round] = serialize(g);
    await solveRound(g);
    if (g.round !== round || g.status !== "summary")
      throw Error("Nie rozliczono trybu swobodnego");
    console.log(JSON.stringify({ round, cash: g.cash, stock: g.stock.length }));
  }
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
