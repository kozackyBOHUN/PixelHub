/**
 * Reproduce the planner audit without editing production files:
 *   node --experimental-strip-types scripts/audit_benchmark.ts \
 *     --baseline ee23be2 --repeat 5 --output /tmp/pixelhub-planner-benchmark.json
 *
 * Each version/layout runs in a fresh child. Timings use untouched source;
 * independent copied-source runs add state/heap counters. Snapshot directories
 * are removed after the run. Cold means the first planner call after import;
 * warm samples reuse the swept-geometry caches. Memory reports are process RSS
 * high-water marks and before/after heap usage, not an allocation profile.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { cpus, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Point = { x: number; y: number };
type Pose = Point & { d: number; mode?: "pull" | "push" };
type Layout = {
  id: string;
  description: string;
  start: Pose;
  source: Point;
  dest: Point;
  sourceDirection?: number;
  destDirection?: number;
  crates: Point[];
  reservations?: Point[];
};
const script = fileURLToPath(import.meta.url);
const repo = resolve(dirname(script), "..");
const source = { x: -1, y: 2 };
const inbound = [source, { x: -2, y: 2 }, { x: -1, y: 3 }, { x: -2, y: 3 }];
const parked = [
  { x: 1, y: 4 },
  { x: 3, y: 5 },
  { x: 16, y: 5 },
  { x: 18, y: 4 },
  { x: 1, y: 5 },
  { x: 3, y: 4 },
  { x: 15, y: 5 },
  { x: 17, y: 5 },
  { x: 2, y: 5 },
  { x: 2, y: 4 },
  { x: 1, y: 3 },
  { x: 3, y: 3 },
  { x: 15, y: 4 },
  { x: 16, y: 4 },
  { x: 17, y: 4 },
  { x: 18, y: 5 },
];
const layouts: Layout[] = [1, 4, 8, 12, 20].map((count) => ({
  id: `warehouse-${count}-crates`,
  description:
    count <= 8
      ? "Inbound rear pickup to outbound front slot across the warehouse"
      : "Synthetic density stress beyond the eight-crate MVP maximum",
  start: { x: 3, y: 1, d: 0 },
  source,
  dest: { x: 21, y: 2 },
  sourceDirection: 0,
  destDirection: 4,
  crates: count === 1 ? [source] : [...inbound, ...parked.slice(0, count - 4)],
}));
layouts.push({
  ...layouts[2],
  id: "warehouse-8-crates-blocked-corridor",
  description:
    "No route across the two-row top corridor; bounded failed search",
  reservations: [
    { x: 10, y: 0 },
    { x: 10, y: 1 },
    { x: 10, y: 2 },
  ],
});

function option(name: string, fallback: string) {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function finiteMedian(samples: Record<string, number>[], key: string) {
  return median(samples.map((sample) => sample[key]));
}
function samePlan(a: any, b: any) {
  return (
    a.accepted === b.accepted &&
    a.cost === b.cost &&
    a.steps === b.steps &&
    a.stepsSha256 === b.stepsSha256
  );
}

async function worker() {
  const snapshot = process.argv[3];
  const layout = layouts[Number(process.argv[4])];
  const repeat = Number(process.argv[5]);
  const instrumented = process.argv[6] === "instrumented";
  const pathfinding = await import(
    pathToFileURL(join(snapshot, "src/pathfinding.ts")).href
  );
  const simulation = await import(
    pathToFileURL(join(snapshot, "src/simulation.ts")).href
  );
  const counters = {
    settledStates: 0,
    heapPushes: 0,
    heapPops: 0,
    maxSingleHeap: 0,
    liveFreePredicateCalls: 0,
    snapshotPredicateCalls: 0,
  };
  (globalThis as any).__pixelhubAudit = counters;
  if (instrumented) {
    const originalPush = pathfinding.MinHeap.prototype.push;
    const originalPop = pathfinding.MinHeap.prototype.pop;
    pathfinding.MinHeap.prototype.push = function (
      value: unknown,
      cost: number,
    ) {
      counters.heapPushes++;
      const result = originalPush.call(this, value, cost);
      counters.maxSingleHeap = Math.max(
        counters.maxSingleHeap,
        this.items.length,
      );
      return result;
    };
    pathfinding.MinHeap.prototype.pop = function () {
      const result = originalPop.call(this);
      if (result) counters.heapPops++;
      return result;
    };
  }
  const game = new simulation.Game();
  game.round = 2;
  game.inbound = game.outbound = "docked";
  game.pose = { ...layout.start };
  game.crates = layout.crates.map((p, i) => ({
    id: `cargo-${i}`,
    color: "red",
    active: true,
    paid: true,
    loc:
      p.x < 0
        ? { kind: "inbound", lane: p.y - 2, depth: -p.x - 1 }
        : { kind: "floor", ...p },
  }));
  for (const p of layout.reservations ?? [])
    game.reservations.add(`${p.x},${p.y}`);
  if (instrumented) {
    const liveFree = game.free;
    game.free = function (...args: any[]) {
      const free = liveFree.apply(this, args);
      return (p: Point) => {
        counters.liveFreePredicateCalls++;
        return free(p);
      };
    };
    if (typeof game.planningFree === "function") {
      const snapshotFree = game.planningFree;
      game.planningFree = function (...args: any[]) {
        const free = snapshotFree.apply(this, args);
        return (p: Point) => {
          counters.snapshotPredicateCalls++;
          return free(p);
        };
      };
    }
  }
  const run = () => {
    game.task = null;
    game.source = "cargo-0";
    game.selected = true;
    (globalThis as any).gc?.();
    const before = process.memoryUsage();
    const cpu = process.cpuUsage();
    const start = performance.now();
    const accepted = game.order({ kind: "outbound", lane: 0, depth: 1 });
    const plan = game.task;
    const elapsedMs = performance.now() - start;
    const cpuTime = process.cpuUsage(cpu);
    const after = process.memoryUsage();
    return {
      elapsedMs,
      cpuUserMs: cpuTime.user / 1000,
      cpuSystemMs: cpuTime.system / 1000,
      heapBeforeBytes: before.heapUsed,
      heapAfterBytes: after.heapUsed,
      heapDeltaBytes: after.heapUsed - before.heapUsed,
      rssBeforeBytes: before.rss,
      rssAfterBytes: after.rss,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
      accepted,
      cost: plan?.cost ?? null,
      steps: plan?.steps.length ?? 0,
      stepsSha256: plan
        ? createHash("sha256").update(JSON.stringify(plan.steps)).digest("hex")
        : null,
    };
  };
  const cold = run();
  if (instrumented) {
    process.stdout.write(JSON.stringify({ layout: layout.id, cold, counters }));
    return;
  }
  const warm = Array.from({ length: repeat }, run);
  if (warm.some((sample) => !samePlan(cold, sample)))
    throw new Error(`Cold/warm planner behavior differs: ${layout.id}`);
  const warmMedian = Object.fromEntries(
    [
      "elapsedMs",
      "cpuUserMs",
      "cpuSystemMs",
      "heapBeforeBytes",
      "heapAfterBytes",
      "heapDeltaBytes",
      "rssBeforeBytes",
      "rssAfterBytes",
      "maxRssBytes",
    ].map((key) => [key, finiteMedian(warm as any, key)]),
  );
  process.stdout.write(
    JSON.stringify({ layout: layout.id, cold, warm, warmMedian }),
  );
}

function snapshot(
  directory: string,
  revision: string | null,
  instrumented: boolean,
) {
  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(join(directory, "package.json"), '{"type":"module"}\n');
  const hashes: Record<string, string> = {};
  for (const file of [
    "config.ts",
    "game-config.json",
    "pathfinding.ts",
    "transport.ts",
    "simulation.ts",
  ]) {
    let sourceText: string;
    if (revision) {
      const result = spawnSync("git", ["show", `${revision}:src/${file}`], {
        cwd: repo,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      if (result.error || result.status !== 0)
        throw new Error(String(result.error ?? result.stderr));
      sourceText = result.stdout;
    } else sourceText = readFileSync(join(repo, "src", file), "utf8");
    hashes[file] = createHash("sha256").update(sourceText).digest("hex");
    if (
      instrumented &&
      (file === "pathfinding.ts" || file === "transport.ts")
    ) {
      const needle = "if (c !== cost.get(k)) continue;";
      if (!sourceText.includes(needle))
        throw new Error(`Instrumentation marker missing: ${file}`);
      sourceText = sourceText.replaceAll(
        needle,
        `${needle}\n    (globalThis as any).__pixelhubAudit.settledStates++;`,
      );
    }
    writeFileSync(join(directory, "src", file), sourceText);
  }
  return hashes;
}

async function main() {
  const baseline = option("--baseline", "ee23be2");
  const repeat = Number(option("--repeat", "5"));
  const output = resolve(
    option("--output", "/tmp/pixelhub-planner-benchmark.json"),
  );
  if (!Number.isInteger(repeat) || repeat < 1)
    throw new Error("--repeat must be a positive integer");
  const scratch = mkdtempSync(join(tmpdir(), "pixelhub-audit-benchmark-"));
  const result: any = {
    createdAt: new Date().toISOString(),
    baseline,
    machine: {
      node: process.version,
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
    },
    methodology: {
      repeat,
      timing:
        "Uninstrumented source; first call cold, later calls share geometry cache; explicit GC before each sample",
      workload:
        "Game.order for an already-selected inbound source; includes source/destination checks, planner collision callbacks and occupancy snapshot construction when present",
      instrumentation:
        "Separate copied-source run counts settled states, heap pushes/pops, collision predicates and largest individual frontier",
      memory:
        "heapUsed before/after each call; RSS and process maxRSS include runtime/imports/caches; not peak planner-only heap",
      crates:
        "1/4/8 within MVP maximum; 12/20 synthetic density stress; all warehouse geometry matches config",
    },
    layouts,
    versions: {},
  };
  try {
    for (const [name, revision] of [
      ["baseline", baseline],
      ["current", null],
    ] as const) {
      const plain = join(scratch, name),
        counted = join(scratch, `${name}-instrumented`);
      const hashes = snapshot(plain, revision, false);
      snapshot(counted, revision, true);
      const rows = [];
      for (let i = 0; i < layouts.length; i++) {
        const call = (path: string, mode: string) => {
          const child = spawnSync(
            process.execPath,
            [
              "--expose-gc",
              "--experimental-strip-types",
              script,
              "--worker",
              path,
              String(i),
              String(repeat),
              mode,
            ],
            {
              cwd: repo,
              encoding: "utf8",
              timeout: 120_000,
              maxBuffer: 16 * 1024 * 1024,
            },
          );
          if (child.error || child.status !== 0)
            throw new Error(
              `${name}/${layouts[i].id}: ${child.error ?? child.stderr}`,
            );
          return JSON.parse(child.stdout);
        };
        const timing = call(plain, "plain"),
          countedResult = call(counted, "instrumented");
        if (!samePlan(timing.cold, countedResult.cold))
          throw new Error("Instrumentation changed planner behavior");
        rows.push({ ...timing, counters: countedResult.counters });
        process.stderr.write(
          `${name} ${layouts[i].id}: cold ${timing.cold.elapsedMs.toFixed(1)} ms, warm ${timing.warmMedian.elapsedMs.toFixed(1)} ms, settled ${countedResult.counters.settledStates}\n`,
        );
      }
      result.versions[name] = { hashes, results: rows };
    }
    result.equivalence = layouts.map((layout, i) => {
      const before = result.versions.baseline.results[i],
        after = result.versions.current.results[i];
      return {
        layout: layout.id,
        identicalPlan: samePlan(before.cold, after.cold),
        identicalSearchCounts: [
          "settledStates",
          "heapPushes",
          "heapPops",
          "maxSingleHeap",
        ].every((key) => before.counters[key] === after.counters[key]),
      };
    });
    writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${output}\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--worker") await worker();
else await main();
