import cfg, { inside, room, dock, key, same, tail } from "./config.ts";
import type { Point, Pose } from "./config.ts";
import {
  findPath,
  transition,
  geometry,
  geometryFree,
  rig,
} from "./pathfinding.ts";
import { planTransport, pointAt, offset, travel } from "./transport.ts";
import type { TransportStep, Phase } from "./transport.ts";
export type Location =
  | { kind: "floor"; x: number; y: number }
  | { kind: "inbound" | "outbound"; lane: number; depth: number }
  | { kind: "worker" | "delivery" | "delivered" };
export type Crate = {
  id: string;
  color: "red" | "blue";
  active: boolean;
  paid: boolean;
  loc: Location;
};
export type Task = {
  crate: string;
  dest: Location;
  phase: Phase;
  steps: TransportStep[];
  route: Pose[];
  elapsed: number;
  blocked: boolean;
  cost: number;
  inserted: boolean;
  deposited: boolean;
  cancelRequested?: boolean;
  recovery?: boolean;
};
export function locationPoint(l: Location): Point | null {
  return l.kind === "floor"
    ? l
    : "lane" in l
      ? pointAt(l.kind, l.lane, l.depth)
      : null;
}
export class Game {
  round = 1;
  time = 0;
  speed = 1;
  status: "playing" | "summary" | "won" | "lost" = "playing";
  pose: Pose = { ...cfg.worker.startPose.head, d: 0 };
  crates: Crate[] = [];
  task: Task | null = null;
  selected = false;
  source: string | null = null;
  carried: string | null = null;
  inbound: "waiting" | "arriving" | "docked" | "departing" | "absent" =
    "waiting";
  inboundTimer = 0;
  outbound: "absent" | "docked" | "delivering" = "absent";
  deliveryRemaining = 0;
  message = "Kliknij CMR, aby przyjąć dostawę.";
  highlight: string | null = null;
  accumulator = 0;
  reservations = new Set<string>();
  ledger = [
    { time: 0, amount: cfg.economy.initialCash, label: "Kapitał początkowy" },
  ];
  get cash() {
    return this.ledger.reduce((s, e) => s + e.amount, 0);
  }
  money(amount: number, label: string) {
    this.ledger.push({ time: this.time, amount, label });
    if (this.cash <= 0) this.status = "lost";
  }
  accept() {
    if (this.status !== "playing" || this.inbound !== "waiting") return;
    this.inbound = "arriving";
    this.inboundTimer = 1;
    for (let lane = 0; lane < 2; lane++)
      for (let depth = 0; depth < 2; depth++)
        this.crates.push({
          id: `${this.round}-${lane}-${depth}`,
          color: lane === 0 ? "red" : "blue",
          active: this.round === 2,
          paid: false,
          loc: { kind: "inbound", lane, depth },
        });
    this.message = "Kliknij pracownika, następnie dostępną skrzynię.";
  }
  slot(kind: "inbound" | "outbound", lane: number, depth: number) {
    return this.crates.find(
      (c) =>
        c.loc.kind === kind &&
        "lane" in c.loc &&
        c.loc.lane === lane &&
        c.loc.depth === depth,
    );
  }
  accessible(l: Location) {
    if (l.kind === "inbound" || l.kind === "outbound") {
      if (
        !Number.isInteger(l.lane) ||
        !Number.isInteger(l.depth) ||
        l.lane < 0 ||
        l.lane > 1 ||
        l.depth < 0 ||
        l.depth > 1
      )
        return false;
      if ((l.kind === "inbound" ? this.inbound : this.outbound) !== "docked")
        return false;
      return l.depth === 0 || !this.slot(l.kind, l.lane, 0);
    }
    return true;
  }
  free(ignore?: string, extra?: Point) {
    return (p: Point) => {
      const vehicle =
        (p.x === -1 || p.x === -2) && (p.y === 2 || p.y === 3)
          ? this.inbound === "docked"
          : (p.x === 20 || p.x === 21) && (p.y === 2 || p.y === 3)
            ? this.outbound === "docked"
            : false;
      return (
        ((inside(p) &&
          !room(p) &&
          !(this.round === 1 && p.x === 19 && dock(p))) ||
          vehicle) &&
        !this.reservations.has(key(p)) &&
        (!extra || !same(p, extra)) &&
        !this.crates.some(
          (c) =>
            c.id !== ignore &&
            !!locationPoint(c.loc) &&
            same(locationPoint(c.loc)!, p),
        )
      );
    };
  }
  storage(p: Point) {
    return (
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      inside(p) &&
      this.free()(p) &&
      !dock(p)
    );
  }
  contact(l: Location, p: Pose) {
    const q = locationPoint(l);
    return (
      !!q && same(tail(p), offset(q, p.d, 1)) && this.sourceDirection(l, p.d)
    );
  }
  sourceDirection(l: Location, d: number) {
    return l.kind === "inbound"
      ? d === 0
      : l.kind === "outbound"
        ? d === 4
        : true;
  }
  get transportGeometry() {
    const t = this.task,
      step = t?.steps[0];
    return step
      ? geometry(step.a, step.b, Math.min(1, t!.elapsed / step.duration))
      : geometry(this.pose);
  }
  get forkHeight() {
    const t = this.task;
    if (t?.phase === "LIFT")
      return Math.min(1, t.elapsed / cfg.worker.pickupSeconds);
    if (t?.phase === "LOWER")
      return Math.max(0, 1 - t.elapsed / cfg.worker.dropSeconds);
    return this.carried ? 1 : 0;
  }
  get transportState() {
    return this.task?.blocked ? "BLOCKED" : (this.task?.phase ?? "IDLE");
  }
  vehicleOccupied(kind: "inbound" | "outbound") {
    const g = this.transportGeometry;
    return !geometryFree(
      g,
      (p) => (kind === "inbound" ? p.x >= 0 : p.x < 20),
      !!this.carried,
    );
  }
  selectWorker() {
    if (this.status !== "playing") return;
    this.selected = true;
    this.message = this.task
      ? "Pracownik wykonuje zadanie."
      : "Kliknij dostępną skrzynię.";
  }
  choose(id: string) {
    if (!this.selected || this.task || this.status !== "playing") return false;
    const c = this.crates.find((c) => c.id === id);
    if (!c || !["floor", "inbound", "outbound"].includes(c.loc.kind))
      return false;
    if (!this.accessible(c.loc)) {
      this.highlight =
        "lane" in c.loc
          ? (this.slot(c.loc.kind as "inbound" | "outbound", c.loc.lane, 0)
              ?.id ?? null)
          : null;
      this.message =
        "Ta skrzynia jest zablokowana przez inną lub auto jest w ruchu.";
      return false;
    }
    const route = findPath(
      this.pose,
      (p) => this.contact(c.loc, p),
      this.free(),
    );
    if (!route) {
      this.message = "Brak dojazdu dla zestawu 1×2.";
      return false;
    }
    this.source = id;
    this.highlight = null;
    this.message = "Wskaż wolne pole na magazynie lub dostępny slot busa.";
    return true;
  }
  order(dest: Location) {
    if (this.status !== "playing" || this.task || !this.selected) return false;
    const c = this.crates.find((c) => c.id === (this.carried ?? this.source));
    if (!c) return false;
    if (dest.kind === "floor") {
      if (!this.storage(dest)) {
        this.message = "To pole jest zajęte, zablokowane lub jest rampą.";
        return false;
      }
    } else if (dest.kind === "outbound") {
      if (
        !c.active ||
        !this.accessible(dest) ||
        this.slot("outbound", dest.lane, dest.depth)
      ) {
        this.message =
          "Slot niedostępny. Najpierw załaduj przód; bus musi stać przy rampie.";
        return false;
      }
    } else return false;
    const source = locationPoint(c.loc) ?? tail(this.pose),
      target = locationPoint(dest)!;
    const plan = planTransport(
      this.pose,
      source,
      target,
      this.free(),
      this.free(c.id),
      c.loc.kind === "inbound" ? 0 : c.loc.kind === "outbound" ? 4 : undefined,
      dest.kind === "outbound" ? 4 : undefined,
      !!this.carried,
    );
    if (!plan) {
      this.message =
        "Brak pełnego bezpiecznego manewru: dojazd, wsunięcie, transport, odstawienie i wycofanie wideł.";
      return false;
    }
    this.task = {
      crate: c.id,
      dest,
      steps: plan.steps,
      phase: plan.steps[0].phase,
      route: [],
      elapsed: 0,
      blocked: false,
      cost: plan.cost,
      inserted: false,
      deposited: false,
    };
    this.updateRoute();
    this.source = null;
    this.message = "Zadanie przyjęte.";
    return true;
  }
  updateRoute() {
    const t = this.task;
    if (!t) return;
    t.phase = t.steps[0]?.phase ?? "EXIT";
    t.route = t.steps.length
      ? [t.steps[0].a, ...t.steps.map((s) => s.b)]
      : [this.pose];
  }
  clearTask() {
    this.task = null;
    this.source = null;
    this.selected = !!this.carried;
    this.message = this.carried
      ? "Ładunek pozostaje na paleciaku. Wskaż nowe miejsce."
      : "Wybór anulowany. Kliknij pracownika.";
  }
  cancel() {
    if (this.status !== "playing") return;
    const t = this.task;
    if (!t) {
      this.clearTask();
      return;
    }
    // Once lowered, finish disengaging before accepting another job.
    if (t.deposited) {
      t.cancelRequested = false;
      this.message = "Kończenie bezpiecznego wycofania wideł.";
      return;
    }
    t.cancelRequested = true;
    this.message = "Anulowanie: bezpieczne wycofanie bieżącego manewru.";
  }
  dispatch() {
    if (
      this.status !== "playing" ||
      this.outbound !== "docked" ||
      this.vehicleOccupied("outbound") ||
      this.task?.dest.kind === "outbound" ||
      this.crates.some(
        (c) => c.id === this.task?.crate && c.loc.kind === "outbound",
      )
    )
      return false;
    const cargo = this.crates.filter((c) => c.loc.kind === "outbound");
    if (!cargo.length) return false;
    this.deliveryRemaining =
      new Set(cargo.map((c) => c.color)).size === 1
        ? cfg.vehicles.deliveryDurationGameSeconds.oneColor
        : cfg.vehicles.deliveryDurationGameSeconds.twoColors;
    cargo.forEach((c) => (c.loc = { kind: "delivery" }));
    this.outbound = "delivering";
    return true;
  }
  nextRound() {
    if (this.status !== "summary") return;
    this.round = 2;
    this.status = "playing";
    this.crates.forEach((c) => (c.active = true));
    this.outbound = "docked";
    this.inbound = "waiting";
    this.selected = false;
    this.source = null;
    this.message =
      "Runda 2. Przyjmij CMR i dostarcz 8 skrzyń. Bus jest bezpłatny.";
  }
  advance(realSeconds: number) {
    if (this.status !== "playing") return;
    this.accumulator += realSeconds * this.speed;
    while (this.accumulator + 1e-9 >= 0.05 && this.status === "playing") {
      this.accumulator -= 0.05;
      this.step(0.05);
    }
    if (this.status !== "playing") this.accumulator = 0;
  }
  step(dt: number) {
    if (this.status !== "playing") return;
    const old = this.time;
    this.time = Math.round((this.time + dt) * 1e6) / 1e6;
    if (
      Math.floor(this.time / cfg.economy.wageIntervalGameSeconds) >
      Math.floor(old / cfg.economy.wageIntervalGameSeconds)
    ) {
      this.money(-cfg.economy.workerWagePerFullGameMinute, "Pensja");
      if (this.cash <= 0) return;
    }
    if (this.inbound === "arriving" || this.inbound === "departing") {
      this.inboundTimer -= dt;
      if (this.inboundTimer <= 1e-8)
        this.inbound = this.inbound === "arriving" ? "docked" : "absent";
    }
    if (this.outbound === "delivering") {
      this.deliveryRemaining = Math.max(0, this.deliveryRemaining - dt);
      if (this.deliveryRemaining < 1e-8) {
        const cargo = this.crates.filter((c) => c.loc.kind === "delivery");
        cargo.forEach((c) => (c.loc = { kind: "delivered" }));
        this.money(
          cargo.length * cfg.economy.deliveryRewardPerCrate,
          "Dostawa",
        );
        this.outbound = "docked";
      }
    }
    const t = this.task;
    if (t) {
      const c = this.crates.find((c) => c.id === t.crate)!,
        s = t.steps[0];
      const ignore =
        this.carried || t.inserted || t.deposited || s.phase === "INSERT_FORKS"
          ? c.id
          : undefined;
      const free = this.free(ignore);
      let safe =
        s.a === s.b ||
        (same(s.a, s.b) && s.a.d === s.b.d && s.a.mode === s.b.mode)
          ? geometryFree(this.transportGeometry, free, !!this.carried)
          : transition(s.a, s.b, free, !!this.carried);
      if (t.cancelRequested) {
        // Only the already traversed part is needed for reversing. An obstacle
        // ahead must not prevent cancellation at the last safe configuration.
        safe = true;
        const fraction = Math.min(1, t.elapsed / s.duration);
        for (let i = 0; i <= 32; i++)
          if (
            !geometryFree(
              geometry(s.a, s.b, (fraction * i) / 32),
              free,
              !!this.carried,
              0.002,
            )
          )
            safe = false;
      }
      if (!safe) {
        t.blocked = true;
        this.message =
          "Trasa zablokowana. Usuń przeszkodę lub anuluj polecenie.";
      } else {
        t.blocked = false;
        if (t.cancelRequested) {
          t.elapsed = Math.max(0, t.elapsed - dt);
          if (t.elapsed <= 1e-8) {
            this.pose = { ...s.a };
            if (t.inserted && !this.carried) {
              const a = rig(this.pose),
                b = { ...offset(a, a.d, 1), d: a.d, mode: "pull" as const };
              t.steps = [
                travel(a, { ...a, mode: "pull" }, false),
                travel({ ...a, mode: "pull" }, b, false, "WITHDRAW_FORKS"),
              ];
              t.recovery = true;
              t.cancelRequested = false;
              this.updateRoute();
            } else this.clearTask();
          }
        } else {
          t.elapsed += dt;
          if (t.elapsed + 1e-8 >= s.duration) {
            t.elapsed = Math.max(0, t.elapsed - s.duration);
            this.pose = { ...s.b };
            t.steps.shift();
            if (s.phase === "INSERT_FORKS") t.inserted = true;
            if (s.phase === "LIFT") {
              c.loc = { kind: "worker" };
              this.carried = c.id;
              t.inserted = false;
            }
            if (s.phase === "LOWER") {
              c.loc = { ...t.dest };
              this.carried = null;
              t.deposited = true;
            }
            if (!t.steps.length) {
              if (t.deposited && c.loc.kind === "floor" && !c.paid) {
                c.paid = true;
                this.money(cfg.economy.unloadRewardPerCrate, "Rozładunek");
              }
              this.clearTask();
              if (!t.recovery)
                this.message =
                  "Odłożono skrzynię i wycofano widły. Kliknij pracownika.";
            } else this.updateRoute();
          }
        }
      }
    }
    // Vehicles wait until the entire rig has physically left their cargo space.
    if (
      !this.task &&
      this.inbound === "docked" &&
      !this.crates.some((c) => c.loc.kind === "inbound") &&
      !this.vehicleOccupied("inbound")
    ) {
      this.inbound = "departing";
      this.inboundTimer = 1;
    }
    if (this.status !== "playing") return;
    if (
      !this.task &&
      this.round === 1 &&
      this.inbound === "absent" &&
      this.crates.length === 4 &&
      this.crates.every((c) => c.loc.kind === "floor")
    ) {
      this.money(
        4 * cfg.economy.storageRewardPerCratePerCompletedRound,
        "Przechowanie",
      );
      if (this.status === "playing") this.status = "summary";
    }
    if (
      this.round === 2 &&
      this.inbound === "absent" &&
      this.outbound === "docked" &&
      this.crates.length === 8 &&
      this.crates.every((c) => c.loc.kind === "delivered")
    )
      this.status = "won";
  }
  assertInvariant() {
    const occupied = new Set<string>();
    if (
      cfg.map.columns * cfg.map.rows !== 120 ||
      cfg.map.rooms.reduce((s, r) => s + r.width * r.height, 0) !== 36
    )
      throw Error("Geometria");
    if (!Number.isFinite(this.cash) || !Number.isFinite(this.time))
      throw Error("Ekonomia");
    const ids = new Set<string>();
    for (const c of this.crates) {
      if (ids.has(c.id)) throw Error("Powielony identyfikator");
      ids.add(c.id);
      let k: string;
      if (c.loc.kind === "floor") {
        if (
          !Number.isInteger(c.loc.x) ||
          !Number.isInteger(c.loc.y) ||
          !inside(c.loc) ||
          room(c.loc) ||
          dock(c.loc)
        )
          throw Error("Skrzynia poza magazynem");
        k = key(c.loc);
      } else if ("lane" in c.loc)
        k = `${c.loc.kind}:${c.loc.lane}:${c.loc.depth}`;
      else if (c.loc.kind === "worker") k = "worker";
      else continue;
      if (occupied.has(k)) throw Error("Kolizja skrzyń");
      occupied.add(k);
    }
    const ignore =
      this.carried ??
      (this.task?.inserted ||
      this.task?.deposited ||
      this.task?.phase === "INSERT_FORKS"
        ? this.task.crate
        : undefined);
    if (
      !geometryFree(this.transportGeometry, this.free(ignore), !!this.carried)
    )
      throw Error("Kolizja zestawu");
    if (
      this.crates.filter((c) => c.loc.kind === "worker").length !==
      (this.carried ? 1 : 0)
    )
      throw Error("Własność ładunku");
    if (
      this.carried &&
      !this.crates.some((c) => c.id === this.carried && c.loc.kind === "worker")
    )
      throw Error("Nieprawidłowy właściciel ładunku");
    return true;
  }
}
