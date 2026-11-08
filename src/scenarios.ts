import { restore } from "./save.ts";
import { campaign } from "./campaign.ts";
let scenarios: Promise<Record<number, string>> | undefined;
export async function loadScenario(
  round: number,
  report: (text: string) => void = () => {},
) {
  if (!Number.isInteger(round) || round < 1 || round > 30)
    throw Error("Wybierz rundę 1–30");
  try {
    scenarios ??= (async () => {
      const response = await fetch(
        new URL("campaign-scenarios.json.gz", location.href),
      );
      if (!response.ok || !response.body) throw Error("Brak scenariuszy");
      const json = response.headers.get("content-encoding")?.includes("gzip")
        ? await response.json()
        : await new Response(
            response.body.pipeThrough(new DecompressionStream("gzip")),
          ).json();
      if (json.version !== 2 || json.campaign !== JSON.stringify(campaign))
        throw Error("Scenariusze wymagają odtworzenia");
      return json.scenarios as Record<number, string>;
    })();
    const saved = (await scenarios)[round];
    if (!saved) throw Error("Brak rundy");
    const game = restore(saved);
    game.dev = true;
    report(
      `Runda ${round}: odtworzono zweryfikowany stan po ${round - 1} poprzednich rundach. Stan magazynu ${game.stock.length}.`,
    );
    return game;
  } catch {
    report("Odtwarzanie historii przez silnik transportu…");
    const { replayToRound } = await import("./developer.ts");
    return replayToRound(round, report);
  }
}
