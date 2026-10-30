import cfg, { inside, room, dock, key, same, tail } from "./config.ts";
import type { Point, Pose } from "./config.ts";
import { findPath, transition, edgeCost } from "./pathfinding.ts";
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
type Task = {
  crate: string;
  dest: Location;
  phase: "to_source" | "picking" | "to_destination" | "dropping";
  route: Pose[];
  loadedRoute: Pose[];
  elapsed: number;
  blocked: boolean;
  cancelRequested?: boolean;
};
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
      if ((l.kind === "inbound" ? this.inbound : this.outbound) !== "docked")
        return false;
      return l.depth === 0 || !this.slot(l.kind, l.lane, 0);
    }
    return true;
  }
  free(ignore?: string, extra?: Point) {
    return (p: Point) =>
      inside(p) &&
      !room(p) &&
      !(this.round === 1 && p.x === 19 && dock(p)) &&
      !this.reservations.has(key(p)) &&
      (!extra || !same(p, extra)) &&
      !this.crates.some(
        (c) => c.id !== ignore && c.loc.kind === "floor" && same(c.loc, p),
      );
  }
  storage(p: Point) {
    return this.free()(p) && !dock(p);
  }
  contact(l: Location, p: Pose) {
    if (l.kind === "floor") {
      const t = tail(p);
      return Math.abs(t.x - l.x) + Math.abs(t.y - l.y) === 1 && !same(p, l);
    }
    if (l.kind === "inbound" || l.kind === "outbound")
      return (
        tail(p).x === (l.kind === "inbound" ? 0 : 19) &&
        tail(p).y === l.lane + 2
      );
    return false;
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
    const from = this.carried
      ? [this.pose]
      : findPath(this.pose, (p) => this.contact(c.loc, p), this.free());
    if (!from) return false;
    // Select a reachable pickup pose that also permits the loaded route.
    let approach: Pose[] | null = from,
      loaded: Pose[] | null = null;
    const goal = (p: Pose) =>
      this.contact(dest, p) && (dest.kind !== "floor" || !same(tail(p), dest));
    const loadFree = this.free(c.id, dest.kind === "floor" ? dest : undefined);
    loaded = findPath(from.at(-1)!, goal, loadFree);
    if (!loaded && !this.carried) {
      const candidates: Pose[] = [];
      for (let x = 0; x < 20; x++)
        for (let y = 0; y < 6; y++)
          for (let d = 0; d < 8; d++) {
            const p = { x, y, d };
            if (this.contact(c.loc, p)) candidates.push(p);
          }
      for (const p of candidates) {
        const a = findPath(
          this.pose,
          (q) => same(q, p) && q.d === p.d,
          this.free(),
        );
        if (!a) continue;
        const b = findPath(p, goal, loadFree);
        if (b) {
          approach = a;
          loaded = b;
          break;
        }
      }
    }
    if (!loaded) {
      this.message =
        "Brak bezpiecznej trasy dla zestawu 1×2 do wskazanego celu.";
      return false;
    }
    this.task = {
      crate: c.id,
      dest,
      phase: this.carried ? "to_destination" : "to_source",
      route: this.carried ? loaded : approach!,
      loadedRoute: loaded,
      elapsed: 0,
      blocked: false,
    };
    this.source = null;
    this.message = "Zadanie przyjęte.";
    return true;
  }
  cancel() {
    if (this.status !== "playing") return;
    if (this.task && this.task.elapsed > 1e-8) {
      this.task.cancelRequested = true;
      this.message = "Anulowanie: powrót do ostatniej bezpiecznej pozycji.";
      return;
    }
    this.task = null;
    this.source = null;
    this.selected = !!this.carried;
    this.message = this.carried
      ? "Ładunek pozostaje na paleciaku. Wskaż nowe miejsce."
      : "Wybór anulowany. Kliknij pracownika.";
  }
  dispatch() {
    if (
      this.status !== "playing" ||
      this.outbound !== "docked" ||
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
    if (t?.cancelRequested) {
      t.elapsed = Math.max(0, t.elapsed - dt);
      if (t.elapsed <= 1e-8) {
        t.elapsed = 0;
        this.cancel();
      }
      return;
    }
    if (t) {
      const c = this.crates.find((c) => c.id === t.crate)!;
      if (t.phase === "to_source" || t.phase === "to_destination") {
        if (t.route.length > 1) {
          const a = t.route[0],
            b = t.route[1];
          if (
            !transition(
              a,
              b,
              this.free(
                this.carried ?? undefined,
                t.phase === "to_destination" && t.dest.kind === "floor"
                  ? t.dest
                  : undefined,
              ),
            )
          ) {
            t.blocked = true;
            this.message =
              "Trasa zablokowana. Usuń przeszkodę lub anuluj polecenie.";
          } else {
            t.blocked = false;
            t.elapsed += dt;
            const duration =
              edgeCost(a, b) *
              (this.carried
                ? cfg.worker.loadedSecondsPerCardinalTile
                : cfg.worker.emptySecondsPerCardinalTile);
            if (t.elapsed + 1e-8 >= duration) {
              t.elapsed -= duration;
              this.pose = { ...b };
              t.route.shift();
            }
          }
        } else {
          t.phase = t.phase === "to_source" ? "picking" : "dropping";
          t.elapsed = 0;
        }
      } else {
        t.elapsed += dt;
        if (
          t.elapsed + 1e-8 >=
          (t.phase === "picking"
            ? cfg.worker.pickupSeconds
            : cfg.worker.dropSeconds)
        ) {
          if (t.phase === "picking") {
            if (!this.accessible(c.loc) || !this.contact(c.loc, this.pose)) {
              t.blocked = true;
              return;
            }
            const wasInbound = c.loc.kind === "inbound";
            c.loc = { kind: "worker" };
            this.carried = c.id;
            if (
              wasInbound &&
              !this.crates.some((c) => c.loc.kind === "inbound")
            ) {
              this.inbound = "departing";
              this.inboundTimer = 1;
            }
            t.phase = "to_destination";
            t.route = t.loadedRoute;
            t.elapsed = 0;
          } else {
            const available =
              t.dest.kind === "floor"
                ? this.storage(t.dest)
                : t.dest.kind === "outbound" &&
                  this.accessible(t.dest) &&
                  !this.slot("outbound", t.dest.lane, t.dest.depth);
            if (!available) {
              t.blocked = true;
              this.message =
                "Cel zablokowany. Zwolnij miejsce lub anuluj polecenie.";
              return;
            }
            c.loc = { ...t.dest };
            this.carried = null;
            if (c.loc.kind === "floor" && !c.paid) {
              c.paid = true;
              this.money(cfg.economy.unloadRewardPerCrate, "Rozładunek");
            }
            this.task = null;
            this.selected = false;
            this.message = "Odłożono skrzynię. Kliknij pracownika.";
          }
        }
      }
    }
    if (this.status !== "playing") return;
    if (
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
        if (!inside(c.loc) || room(c.loc) || dock(c.loc))
          throw Error("Skrzynia poza magazynem");
        k = key(c.loc);
      } else if ("lane" in c.loc)
        k = `${c.loc.kind}:${c.loc.lane}:${c.loc.depth}`;
      else if (c.loc.kind === "worker") k = "worker";
      else continue;
      if (occupied.has(k)) throw Error("Kolizja skrzyń");
      occupied.add(k);
    }
    if (!this.free()(this.pose) || !this.free()(tail(this.pose)))
      throw Error("Kolizja pracownika");
    return true;
  }
}
