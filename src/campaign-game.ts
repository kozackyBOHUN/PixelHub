import cfg, { key, same, room, dock, tail } from "./config.ts";
import type { Point, Pose } from "./config.ts";
import { Game, locationPoint } from "./simulation.ts";
import type { Crate, Location } from "./simulation.ts";
import { geometryFree, geometry, sweptCells } from "./pathfinding.ts";
import { campaign, upgrades, priorityMultiplier } from "./campaign.ts";
import type { Upgrade, Manifest, PalletSpec } from "./campaign.ts";
export type CMR = Manifest & {
  kind: "inbound" | "outbound";
  state: "waiting" | "arriving" | "docked" | "departing" | "done";
  bay: number;
  timer: number;
};
export const station = { sorter: { x: 5, y: -2 }, service: { x: 12, y: -2 } };
export const sorterOutputs = [
  { x: 9, y: -5 },
  { x: 10, y: -5 },
];
const outputs = sorterOutputs;
export class CampaignGame extends Game {
  override transportOnly = true;
  workers: Game[] = [this];
  workerIndex = 0;
  purchased: Upgrade[] = [];
  cmrs: CMR[] = [];
  settled: number[] = [];
  completedRecipes: string[] = [];
  roundStarted = 0;
  roundStartCash = 50;
  operations = 0;
  dev = false;
  constructor() {
    super();
    this.startRound();
  }
  get config() {
    return campaign[this.round - 1];
  }
  get minY() {
    return this.purchased.includes("expansion2")
      ? -12
      : this.purchased.includes("expansion")
        ? -6
        : 0;
  }
  get activeWorker() {
    return this.workers[this.workerIndex];
  }
  get stock() {
    return this.crates.filter(
      (c) => !["consumed", "delivered"].includes(c.loc.kind),
    );
  }
  get requiredIds() {
    return new Set(this.config.departures.flatMap((m) => m.palletIds));
  }
  cmrAt(kind: "inbound" | "outbound", bay = 0) {
    return this.cmrs.find(
      (m) =>
        m.kind === kind &&
        m.bay === bay &&
        ["docked", "arriving", "departing"].includes(m.state),
    );
  }
  startRound() {
    this.cmrs = [
      ...this.config.arrivals.map((m) => ({ ...m, kind: "inbound" as const })),
      ...this.config.departures.map((m) => ({
        ...m,
        kind: "outbound" as const,
      })),
    ].map((m) => ({ ...m, state: "waiting", bay: 0, timer: 0 }));
    this.roundStarted = this.time;
    this.roundStartCash = this.cash;
    this.inbound = "waiting";
    this.outbound = "absent";
    this.message = this.config.description;
    for (const c of this.crates) c.active = c.dueRound === this.round;
  }
  createPallet(p: PalletSpec, loc: Location): Crate {
    return {
      ...structuredClone(p),
      active: p.dueRound === this.round,
      paid: false,
      loc,
      ...(p.prioritySeconds
        ? { priority: { started: this.time, duration: p.prioritySeconds } }
        : {}),
    };
  }
  vehicleBusy(kind: "inbound" | "outbound", bay: number) {
    const y = bay ? -4 : 2;
    const clear = (p: Point) =>
      !(p.y >= y && p.y < y + 2 && (kind === "inbound" ? p.x < 0 : p.x >= 20));
    return this.workers.some(
      (w) =>
        !geometryFree(w.transportGeometry, clear, !!w.carried) ||
        !geometryFree(geometry(w.pose), clear, !!w.carried),
    );
  }
  dockCMR(id: string, bay = 0) {
    const m = this.cmrs.find((m) => m.id === id);
    if (
      this.status !== "playing" ||
      !m ||
      m.state !== "waiting" ||
      bay < 0 ||
      bay > (this.purchased.includes("ramps") ? 1 : 0) ||
      this.cmrAt(m.kind, bay)
    )
      return false;
    // A rig still inside an empty trailer prevents replacement.
    if (this.vehicleBusy(m.kind, bay)) return false;
    m.bay = bay;
    m.state = "arriving";
    m.timer = 1;
    if (m.kind === "inbound") {
      const pallets = this.config.pallets;
      for (const [i, id] of m.palletIds.entries()) {
        if (this.crates.some((c) => c.id === id))
          throw Error("Ponowne przyjęcie palety");
        this.crates.push(
          this.createPallet(
            pallets.find((p) => p.id === id)!,
            { kind: "inbound", lane: i % 2, depth: Math.floor(i / 2), bay },
          ),
        );
      }
    }
    this.syncVehicles();
    return true;
  }
  override accept() {
    const m = this.cmrs.find(
      (m) => m.kind === "inbound" && m.state === "waiting",
    );
    if (m) this.dockCMR(m.id);
  }
  syncVehicles() {
    const im = this.cmrAt("inbound"),
      om = this.cmrAt("outbound");
    this.inbound =
      im?.state === "arriving"
        ? "arriving"
        : im?.state === "departing"
          ? "departing"
          : im?.state === "docked"
            ? "docked"
            : this.cmrs.some(
                  (m) => m.kind === "inbound" && m.state === "waiting",
                )
              ? "waiting"
              : "absent";
    this.inboundTimer = im?.timer ?? 0;
    this.outbound = om?.state === "docked" ? "docked" : "absent";
    for (const w of this.workers.slice(1)) {
      w.inbound = this.inbound;
      w.outbound = this.outbound;
      w.round = this.round;
    }
  }
  override slot(
    kind: "inbound" | "outbound",
    lane: number,
    depth: number,
    bay = 0,
  ) {
    return this.crates.find(
      (c) =>
        c.loc.kind === kind &&
        "lane" in c.loc &&
        c.loc.lane === lane &&
        c.loc.depth === depth &&
        (c.loc.bay ?? 0) === bay,
    );
  }
  override accessible(l: Location) {
    if (!("lane" in l)) return true;
    const m = this.cmrAt(l.kind, l.bay ?? 0);
    return (
      !!m &&
      m.state === "docked" &&
      Number.isInteger(l.lane) &&
      l.lane >= 0 &&
      l.lane < 2 &&
      Number.isInteger(l.depth) &&
      l.depth >= 0 &&
      l.depth < m.capacity / 2 &&
      Array.from({ length: l.depth }, (_, d) => d).every(
        (d) => !this.slot(l.kind, l.lane, d, l.bay ?? 0),
      )
    );
  }
  freeFor(worker: Game, ignore?: string, extra?: Point) {
    const others = this.workers.filter((w) => w !== worker);
    const blocked = new Set<string>();
    for (const w of others) {
      geometryFree(
        w.transportGeometry,
        (p) => {
          blocked.add(key(p));
          return true;
        },
        !!w.carried,
      );
      for (const s of w.task?.steps ?? [])
        for (const p of sweptCells(s.a, s.b, s.loaded)) blocked.add(key(p));
    }
    return (p: Point) => {
      const vehicle = this.cmrs.some(
        (m) =>
          m.state === "docked" &&
          p.y >= (m.bay ? -4 : 2) &&
          p.y <= (m.bay ? -3 : 3) &&
          (m.kind === "inbound"
            ? p.x >= -m.capacity / 2 && p.x < 0
            : p.x >= 20 && p.x < 20 + m.capacity / 2),
      );
      return (
        ((p.x >= 0 && p.x < 20 && p.y >= this.minY && p.y < 6 && !room(p)) ||
          vehicle) &&
        !blocked.has(key(p)) &&
        (!extra || !same(p, extra)) &&
        !this.crates.some(
          (c) =>
            c.id !== ignore &&
            locationPoint(c.loc) &&
            same(locationPoint(c.loc)!, p),
        )
      );
    };
  }
  override free(ignore?: string, extra?: Point) {
    return this.freeFor(this, ignore, extra);
  }
  planningFor(w: Game, ignore?: string) {
    const live = this.freeFor(w, ignore),
      cells = new Set<string>();
    for (let x = -4; x < 24; x++)
      for (let y = this.minY; y < 6; y++)
        if (live({ x, y })) cells.add(key({ x, y }));
    return (p: Point) => cells.has(key(p));
  }
  override planningFree(ignore?: string) {
    return this.planningFor(this, ignore);
  }
  storageFor(w: Game, p: Point) {
    return (
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      p.x >= 0 &&
      p.x < 20 &&
      p.y >= this.minY &&
      p.y < 6 &&
      !dock(p) &&
      !(p.x === 0 || p.x === 19) &&
      this.freeFor(w)(p)
    );
  }
  override storage(p: Point) {
    return this.storageFor(this, p);
  }
  override contains(p: Point) {
    return p.x >= 0 && p.x < 20 && p.y >= this.minY && p.y < 6;
  }
  override get escapeGoal() {
    return (p: Pose) => p.y === 1 && tail(p).y === 1 && p.x >= 2 && p.x <= 17;
  }
  override choose(id: string) {
    if (
      this.crates.find((c) => c.id === id)?.owner !== undefined &&
      this.crates.find((c) => c.id === id)?.owner !== 0
    )
      return false;
    return super.choose(id);
  }
  validOrder(w: Game, dest: Location) {
    if (this.status !== "playing") return false;
    const c = this.crates.find((c) => c.id === (w.carried ?? w.source));
    if (!c) return false;
    const owner = this.workers.indexOf(w);
    if (c.owner !== undefined && c.owner !== owner) return false;
    if (dest.kind === "outbound") {
      const m = this.cmrAt("outbound", dest.bay ?? 0);
      if (
        !m ||
        !m.palletIds.includes(c.id) ||
        c.mix ||
        c.condition !== "standard" ||
        (c.temperature !== "standard" && !c.climateStored)
      ) {
        w.message =
          "CMR nie zamawia tej palety albo wymaga ona sortowania, serwisu lub strefy temperatur.";
        return false;
      }
    }
    if (dest.kind === "floor") {
      const zone = this.zoneAt(dest);
      if ((zone === "chilled" || zone === "frozen") && c.temperature !== zone) {
        w.message = "Ta strefa jest przeznaczona dla innej temperatury.";
        return false;
      }
      if (
        c.temperature !== "standard" &&
        c.condition === "standard" &&
        !same(dest, station.service) &&
        zone !== c.temperature &&
        !(c.mix && same(dest, station.sorter))
      ) {
        w.message = "Odłóż paletę we właściwej strefie temperatur.";
        return false;
      }
    }
    return true;
  }
  override order(dest: Location) {
    if (!this.validOrder(this, dest)) return false;
    const ok = super.order(dest);
    if (ok) this.lock(this);
    return ok;
  }
  lock(w: Game) {
    const c = this.crates.find((c) => c.id === w.task?.crate);
    if (c) c.owner = this.workers.indexOf(w);
  }
  override money(amount: number, label: string) {
    if (label === "Rozładunek" && this.task)
      amount *= priorityMultiplier(
        this.crates.find((c) => c.id === this.task?.crate)!,
        this.time,
      );
    super.money(amount, label);
  }
  zoneAt(p: Point): "standard" | "chilled" | "frozen" {
    const ys = this.purchased.includes("climate") ? [-4, -7] : [-4];
    if (!ys.includes(p.y)) return "standard";
    if (this.purchased.includes("chiller") && p.x >= 1 && p.x <= 8)
      return "chilled";
    if (this.purchased.includes("freezer") && p.x >= 11 && p.x <= 18)
      return "frozen";
    return "standard";
  }
  processStations() {
    for (const c of this.crates) {
      if (c.loc.kind !== "floor" || c.owner !== undefined) continue;
      if (c.temperature !== "standard" && this.zoneAt(c.loc) === c.temperature)
        c.climateStored = true;
      if (
        same(c.loc, station.service) &&
        this.purchased.includes("service") &&
        c.condition !== "standard"
      ) {
        c.condition = "standard";
        c.climateStored = c.temperature === "standard";
        this.operations++;
        this.message = `${c.id}: serwis / kontrola zwrotu zakończona.`;
      }
      if (
        c.mix &&
        same(c.loc, station.sorter) &&
        this.purchased.includes("sorter")
      ) {
        const recipe = this.config.recipes.find((r) => r.inputs.includes(c.id));
        if (recipe && !this.completedRecipes.includes(recipe.id)) {
          c.loc = { kind: "processing" };
          this.operations++;
        }
      }
    }
    for (const recipe of this.config.recipes) {
      if (
        this.completedRecipes.includes(recipe.id) ||
        !recipe.inputs.every(
          (id) =>
            this.crates.find((c) => c.id === id)?.loc.kind === "processing",
        )
      )
        continue;
      if (
        !outputs.every(
          (p) =>
            this.storageFor(this, p) &&
            this.workers.every(
              (w) =>
                geometryFree(
                  w.transportGeometry,
                  (q) => !same(q, p),
                  !!w.carried,
                ) &&
                !w.task?.steps.some((s) =>
                  sweptCells(s.a, s.b, s.loaded).some((q) => same(q, p)),
                ),
            ),
        )
      ) {
        this.message =
          "Sorter oczekuje: zwolnij oba pola wynikowe (9,−5) i (10,−5).";
        continue;
      }
      for (const id of recipe.inputs)
        this.crates.find((c) => c.id === id)!.loc = { kind: "consumed" };
      for (const [i, p] of recipe.outputs.entries()) {
        const c = this.createPallet(p, { kind: "floor", ...outputs[i] });
        c.paid = true;
        const original = this.crates.find((c) => c.id === recipe.inputs[i])!;
        c.priority = original.priority;
        this.crates.push(c);
      }
      this.completedRecipes.push(recipe.id);
      this.message = "Posortowano 8 kartonów: 2 MIX → 2 palety jednokolorowe.";
    }
  }
  dispatchBay(bay = 0) {
    const m = this.cmrAt("outbound", bay);
    if (this.status !== "playing" || !m || m.state !== "docked") return false;
    const cargo = this.crates.filter(
      (c) =>
        c.loc.kind === "outbound" && "bay" in c.loc && (c.loc.bay ?? 0) === bay,
    );
    if (
      !m.palletIds.every((id) => cargo.some((c) => c.id === id)) ||
      cargo.length !== m.palletIds.length
    )
      return false;
    if (
      this.vehicleBusy("outbound", bay) ||
      this.workers.some(
        (w) =>
          w.task?.dest.kind === "outbound" && (w.task.dest.bay ?? 0) === bay,
      )
    )
      return false;
    for (const c of cargo) {
      c.loc = { kind: "delivered" };
      this.money(
        cfg.economy.deliveryRewardPerCrate * priorityMultiplier(c, this.time),
        "Dostawa",
      );
    }
    m.state = "departing";
    m.timer = 1;
    return true;
  }
  withdrawEmptyOutgoing(id: string) {
    const m = this.cmrs.find(
      (m) => m.id === id && m.kind === "outbound" && m.state === "docked",
    );
    if (
      this.status !== "playing" ||
      !m ||
      this.vehicleBusy("outbound", m.bay) ||
      this.crates.some(
        (c) =>
          c.loc.kind === "outbound" &&
          "bay" in c.loc &&
          (c.loc.bay ?? 0) === m.bay,
      ) ||
      this.workers.some(
        (w) =>
          w.task?.dest.kind === "outbound" && (w.task.dest.bay ?? 0) === m.bay,
      )
    )
      return false;
    m.state = "waiting";
    this.syncVehicles();
    return true;
  }
  override dispatch() {
    return this.dispatchBay();
  }
  buy(id: Upgrade) {
    const u = upgrades[id];
    if (
      this.status !== "playing" ||
      !u ||
      this.round < u.round ||
      this.cash <= u.cost ||
      (id !== "worker" && this.purchased.includes(id)) ||
      (id === "worker" && this.workers.length >= 4)
    )
      return false;
    if (
      ["sorter", "chiller", "freezer", "service"].includes(id) &&
      !this.purchased.includes("expansion")
    ) {
      this.message = "Najpierw rozbuduj halę.";
      return false;
    }
    if (
      (id === "expansion2" && !this.purchased.includes("expansion")) ||
      (id === "ramps" && !this.purchased.includes("expansion")) ||
      (id === "climate" && !this.purchased.includes("expansion2"))
    )
      return false;
    if (id === "worker") {
      const candidates: Pose[] = [
        { x: 17, y: 1, d: 4 },
        { x: 9, y: 0, d: 0 },
        { x: 10, y: -6, d: 0 },
      ];
      const pose = candidates.find((p) =>
        geometryFree(geometry(p), this.free(), false),
      );
      if (!pose) {
        this.message =
          "Zwolnij miejsca startowe pracowników przy górnym przejeździe.";
        return false;
      }
      const w = new WarehouseWorker(this);
      w.pose = { ...pose };
      this.workers.push(w);
    }
    this.purchased.push(id);
    this.money(-u.cost, u.name);
    return true;
  }
  override step(dt: number) {
    if (this.status !== "playing") return;
    // Reuse the complete 0.1 transport execution, including collision checks and fork withdrawal.
    const scale = this.purchased.includes("equipment") ? 1.25 : 1;
    const time = this.time;
    super.step(dt * scale);
    this.time = Math.round((time + dt) * 1e6) / 1e6;
    for (const w of this.workers.slice(1)) {
      w.time = this.time - dt * scale;
      w.step(dt * scale);
      w.time = this.time;
    }
    for (const w of this.workers)
      for (const c of this.crates)
        if (
          c.owner === this.workers.indexOf(w) &&
          !w.task &&
          w.carried !== c.id
        )
          delete c.owner;
    this.processStations();
    for (const m of this.cmrs) {
      if (m.state === "arriving" || m.state === "departing") {
        m.timer -= dt;
        if (m.timer <= 0) m.state = m.state === "arriving" ? "docked" : "done";
      }
      if (
        m.kind === "inbound" &&
        m.state === "docked" &&
        !this.crates.some(
          (c) =>
            c.loc.kind === "inbound" &&
            "bay" in c.loc &&
            (c.loc.bay ?? 0) === m.bay,
        ) &&
        !this.vehicleBusy("inbound", m.bay) &&
        !this.workers.some((w) => w.task && m.palletIds.includes(w.task.crate))
      ) {
        m.state = "departing";
        m.timer = 1;
      }
    }
    this.syncVehicles();
    this.completeRound();
  }
  completeRound() {
    if (
      this.status !== "playing" ||
      this.settled.includes(this.round) ||
      this.workers.some((w) => w.task || w.carried) ||
      !this.cmrs.every((m) => m.state === "done") ||
      this.config.recipes.some((r) => !this.completedRecipes.includes(r.id))
    )
      return false;
    if (
      [...this.requiredIds].some(
        (id) => this.crates.find((c) => c.id === id)?.loc.kind !== "delivered",
      )
    )
      return false;
    const stock = this.stock;
    if (
      stock.length !== this.config.expectedStock ||
      stock.some(
        (c) =>
          c.loc.kind !== "floor" ||
          c.mix ||
          c.condition !== "standard" ||
          (c.temperature !== "standard" &&
            this.zoneAt(c.loc as Point) !== c.temperature),
      )
    )
      return false;
    this.settled.push(this.round);
    this.money(
      stock.length * cfg.economy.storageRewardPerCratePerCompletedRound,
      "Przechowanie",
    );
    this.money(-20 * this.workers.length, `Pensja — runda ${this.round}`);
    if (this.status === "playing")
      this.status = this.round === 30 ? "won" : "summary";
    return true;
  }
  override nextRound() {
    if (this.status !== "summary") return;
    this.round++;
    this.status = "playing";
    this.startRound();
  }
  override assertInvariant() {
    if (
      !Number.isFinite(this.cash) ||
      !Number.isFinite(this.time) ||
      this.round < 1 ||
      this.round > 30
    )
      throw Error("Stan kampanii");
    const ids = new Set<string>(),
      cells = new Set<string>();
    for (const c of this.crates) {
      if (ids.has(c.id)) throw Error("Duplikat palety");
      ids.add(c.id);
      const p = locationPoint(c.loc);
      if (p) {
        const k = key(p);
        if (cells.has(k)) throw Error("Kolizja palet");
        cells.add(k);
        if (
          c.loc.kind === "floor" &&
          (p.y < this.minY ||
            p.y >= 6 ||
            p.x < 1 ||
            p.x >= 19 ||
            room(p) ||
            dock(p))
        )
          throw Error("Paleta w przeszkodzie");
      }
    }
    for (const [i, w] of this.workers.entries()) {
      const owned = this.crates.filter(
        (c) => c.loc.kind === "worker" && c.owner === i,
      );
      if (owned.length !== (w.carried ? 1 : 0)) throw Error("Własność ładunku");
    }
    for (const w of this.workers) {
      const ignore =
        w.carried ??
        (w.task?.inserted ||
        w.task?.deposited ||
        w.task?.phase === "INSERT_FORKS"
          ? w.task.crate
          : undefined);
      if (
        !geometryFree(w.transportGeometry, this.freeFor(w, ignore), !!w.carried)
      )
        throw Error("Kolizja zestawu pracownika");
    }
    const delivered = new Set(
      this.crates.filter((c) => c.loc.kind === "delivered").map((c) => c.id),
    );
    if (
      this.cmrs.some(
        (m) =>
          m.kind === "outbound" &&
          m.state === "done" &&
          m.palletIds.some((id) => !delivered.has(id)),
      )
    )
      throw Error("Niepełna wysyłka");
    return true;
  }
}
class WarehouseWorker extends Game {
  hub: CampaignGame;
  override transportOnly = true;
  constructor(hub: CampaignGame) {
    super();
    this.hub = hub;
    this.crates = hub.crates;
  }
  override free(ignore?: string, extra?: Point) {
    return this.hub.freeFor(this, ignore, extra);
  }
  override planningFree(ignore?: string) {
    return this.hub.planningFor(this, ignore);
  }
  override storage(p: Point) {
    return this.hub.storageFor(this, p);
  }
  override contains(p: Point) {
    return this.hub.contains(p);
  }
  override get escapeGoal() {
    return this.hub.escapeGoal;
  }
  override accessible(l: Location) {
    return this.hub.accessible(l);
  }
  override slot(
    kind: "inbound" | "outbound",
    lane: number,
    depth: number,
    bay = 0,
  ) {
    return this.hub.slot(kind, lane, depth, bay);
  }
  override choose(id: string) {
    const c = this.crates.find((c) => c.id === id);
    if (c?.owner !== undefined && c.owner !== this.hub.workers.indexOf(this))
      return false;
    return super.choose(id);
  }
  override order(dest: Location) {
    if (!this.hub.validOrder(this, dest)) return false;
    const ok = super.order(dest);
    if (ok) this.hub.lock(this);
    return ok;
  }
  override money(amount: number, label: string) {
    if (label === "Rozładunek")
      amount *= priorityMultiplier(
        this.crates.find((c) => c.id === this.task?.crate)!,
        this.hub.time,
      );
    Game.prototype.money.call(this.hub, amount, label);
  }
}
export { WarehouseWorker };
