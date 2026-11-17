import {
  hasFloor,
  initialLevels,
  moduleCost,
  rampAt,
  rampRow,
  zones,
} from "./warehouse.ts";
import type { Zone } from "./warehouse.ts";
import { findPath, poseKey, rig, transition } from "./pathfinding.ts";
import { offset, travel } from "./transport.ts";
import {
  destinationColor,
  ready,
  dispatchRound,
  remainingRounds,
} from "./shipments.ts";
import type { DestinationColor } from "./shipments.ts";
import cfg, { key, same, tail } from "./config.ts";
import type { Point, Pose } from "./config.ts";
import { Game, locationPoint } from "./simulation.ts";
import type { Crate, Location } from "./simulation.ts";
import { geometryFree, geometry, sweptCells } from "./pathfinding.ts";
import {
  campaign,
  upgrades,
  priorityMultiplier,
  scheduledShipments,
  requiredUpgrades,
} from "./campaign.ts";
import type { Upgrade, Manifest, PalletSpec } from "./campaign.ts";
import { cleaningCost, storyCampaign } from "./story-campaign.ts";
import { standardClient, storyEvents, storyOffers } from "./story.ts";
import { freeRound } from "./free-campaign.ts";
type Vehicle = {
  id: string;
  vehicle: string;
  capacity: number;
  bay: number;
  timer: number;
  state: "waiting" | "arriving" | "docked" | "departing" | "done";
};
export type CMR = Manifest & Vehicle & { kind: "inbound" };
export type DeliveryTrip = {
  id: string;
  vehicleId?: string;
  round: number;
  palletIds: string[];
  colors: DestinationColor[];
  seconds: number;
  cost: number;
  returnAt: number;
};
export function quoteDelivery(cargo: Crate[]) {
  if (!cargo.length) return null;
  const colors = [...new Set(cargo.map(destinationColor))].filter(
    (c): c is DestinationColor => c !== "gray",
  );
  if (!colors.length) return null;
  const seconds =
    cfg.vehicles.basePerColorGameSeconds +
    cfg.vehicles.additionalColorGameSeconds * (colors.length - 1);
  return {
    colors,
    seconds,
    cost:
      (seconds / cfg.economy.deliveryBillingIntervalSeconds) *
      cfg.economy.deliveryCostPerInterval,
  };
}
export type ShippingTruck = Omit<Vehicle, "state"> & {
  state: Vehicle["state"] | "in-transit";
  trip?: DeliveryTrip;
  kind: "outbound";
  color: DestinationColor | null;
  legacyMixed?: boolean;
};
export const station = { service: { x: 12, y: -2 } };
export type SorterSite = Point & { d: number };
export const sorterPorts = (site: SorterSite) => ({
  input: offset(site, 0, -1),
  output: offset(site, 0, 1),
  input2: offset(site, 0, -2),
  output2: offset(site, 0, 2),
});
type SorterJob = {
  machine: number;
  recipe: string;
  next: number;
  readyAt: number;
};
export class CampaignGame extends Game {
  override transportOnly = true;
  workers: Game[] = [this];
  workerIndex = 0;
  purchased: Upgrade[] = [];
  cmrs: CMR[] = [];
  trucks: ShippingTruck[] = [];
  tripHistory: DeliveryTrip[] = [];
  tripSequence = 0;
  sorter: SorterSite | null = null;
  sorterJobs: SorterJob[] = [];
  coldCells: Point[] = [];
  coldStock = 0;
  get usesPiesek() {
    return this.purchased.includes("equipment");
  }
  buyColdPack() {
    if (this.status !== "development" || this.cash < upgrades.chiller.cost)
      return false;
    if (!this.purchased.includes("chiller")) this.purchased.push("chiller");
    this.coldStock += 4;
    this.invest(upgrades.chiller.cost, "Chłodnia · 4 pola");
    return true;
  }
  coldPlacementError(p: Point) {
    if (
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      p.x < 4 ||
      p.x >= 16 ||
      !this.contains(p)
    )
      return "Wybierz pole w części magazynowej.";
    if (
      this.zoneAt(p) !== "standard" ||
      same(p, station.service) ||
      this.sorters.some((site) =>
        [site, ...Object.values(sorterPorts(site))].some((q) => same(p, q)),
      ) ||
      !this.workers.every((worker) =>
        geometryFree(
          worker.transportGeometry,
          (q) => !same(q, p),
          !!worker.carried,
        ),
      ) ||
      !this.storageFor(this, p)
    )
      return "Pole jest zajęte lub zarezerwowane.";
  }
  placeColdCell(p: Point) {
    if (
      this.status !== "development" ||
      !this.coldStock ||
      this.coldPlacementError(p)
    )
      return false;
    this.coldCells.push({ ...p });
    this.coldStock--;
    return true;
  }
  extraSorters: SorterSite[] = [];
  get sorters() {
    return [...(this.sorter ? [this.sorter] : []), ...this.extraSorters];
  }

  fleetCapacity: number[] = [4];
  pendingFleet: number[] | null = null;
  levels = initialLevels();
  rampRow(bay: number) {
    return rampRow(bay);
  }
  buyModule(zone: Zone) {
    const level = this.levels[zone];
    const cost = moduleCost(level);
    if (
      this.status !== "development" ||
      !Number.isSafeInteger(cost) ||
      this.cash < cost
    )
      return false;
    this.levels = { ...this.levels, [zone]: level + 1 };
    this.invest(cost, zones[zone].label + " LV" + (level + 1));
    return true;
  }
  isRampRow(kind: "inbound" | "outbound", y: number) {
    const count = kind === "inbound" ? this.inboundBayCount : this.bayCount;
    for (let bay = 0; bay < count; bay++) {
      const row = this.rampRow(bay);
      if (y === row || y === row + 1) return true;
    }
    return false;
  }
  locateSlot(location: Location): Location {
    return "lane" in location
      ? { ...location, row: this.rampRow(location.bay ?? 0) }
      : location;
  }
  get ownedVehicleCount() {
    return this.storyMode ||
      this.round >= cfg.vehicles.freeFirstOwnedVehicleAtRound
      ? this.fleetCapacity.length
      : 0;
  }
  get plannedFleet() {
    return this.pendingFleet ?? this.fleetCapacity;
  }
  vehiclePurchaseReason(index?: number) {
    if (this.status !== "development") return "Zakupy między rundami";
    if (
      index !== undefined &&
      (index < 0 || index >= this.ownedVehicleCount || !Number.isInteger(index))
    )
      return "Brak samochodu";
    if (index === undefined && this.bayCount < 2)
      return "Wymagane minimum 2 rampy wysyłkowe";
    if (index === undefined && this.plannedFleet.length >= this.bayCount)
      return "Brak rampy dla kolejnego samochodu";
    if (this.cash < (index === undefined ? 600 : 150)) return "Brak pieniędzy";
  }
  buyVehicle(index?: number) {
    if (this.vehiclePurchaseReason(index)) return false;
    const fleet = [...this.plannedFleet];
    if (index === undefined) {
      fleet.push(4);
      this.invest(600, "Samochód dostawczy");
    } else {
      fleet[index] += 2;
      this.invest(150, `Ładowność samochodu ${index + 1}`);
    }
    this.pendingFleet = fleet;
    return true;
  }
  shipped: string[] = [];
  pendingWorkers: Pose[] = [];
  developmentRound = 0;
  ledgerStart = 1;
  roundMetrics = {
    damaged: 0,
    returns: 0,
    priorityIds: [] as string[],
    bonus: 0,
  };
  settlement: ReturnType<CampaignGame["roundReport"]> | null = null;
  settled: number[] = [];
  completedRecipes: string[] = [];
  roundStarted = 0;
  roundStartCash = cfg.economy.campaignInitialCash;
  operations = 0;
  dev = false;
  storyMode: boolean;
  storyHistory: Record<string, number> = {};
  clientHasSuccess(client: string) {
    return Object.values(this.contractLoads).some(
      (offer) =>
        offer.client === client && this.contracts[offer.id] === "fulfilled",
    );
  }
  override cancel() {
    this.cancelCleaning(0);
    super.cancel();
  }
  noteStory(id: string, round = this.round) {
    if (this.storyMode) this.storyHistory[id] ??= round;
  }
  freePlans: Record<number, ReturnType<typeof freeRound>> = {};
  plan(round: number) {
    if (round <= 30 || !this.storyMode)
      return (this.storyMode ? storyCampaign : campaign)[round - 1];
    if (this.freePlans[round]) return this.freePlans[round];
    const fleet = this.plannedFleet.reduce(
      (sum, capacity) => sum + capacity,
      0,
    );
    const capacity = Math.max(
      Math.ceil(fleet / 4),
      this.workers.length,
      this.levels.storage - 1,
    );
    const plan = freeRound(round, capacity, this.purchased.includes("service"));
    this.freePlans[round] = plan;
    return plan;
  }
  clutter: Point[] = [];
  cleaning: {
    worker: number;
    target: Point;
    approach: Point;
    startedAt?: number;
  } | null = null;
  cancelCleaning(worker: number) {
    if (this.cleaning?.worker === worker) this.cleaning = null;
  }
  constructor(storyMode = false) {
    super();
    this.storyMode = storyMode;
    this.ledger[0].amount = storyMode ? 0 : cfg.economy.campaignInitialCash;
    if (storyMode)
      this.clutter = [
        { x: 1, y: 3 },
        { x: 18, y: 3 },
      ];
    this.startRound();
  }
  get config() {
    return this.plan(this.round);
  }
  get minY() {
    return -4 * (Math.max(...Object.values(this.levels)) - 1);
  }
  get activeWorker() {
    return this.workers[this.workerIndex];
  }
  get stock() {
    return this.crates.filter(
      (c) => !["consumed", "delivered"].includes(c.loc.kind),
    );
  }
  get requiredCount() {
    if (this.storyMode && (this.round === 1 || this.round > 30))
      return this.config.pallets.length;
    return scheduledShipments(this.round);
  }
  get vehicles() {
    return [...this.cmrs, ...this.trucks];
  }
  get bayCount() {
    return this.levels.shipping;
  }
  get inboundBayCount() {
    return this.levels.receiving;
  }
  get rampCount() {
    return (
      this.inboundBayCount + (this.ownedVehicleCount > 0 ? this.bayCount : 0)
    );
  }
  get rampUpgradeCost() {
    return (
      upgrades.ramps.cost -
      (this.inboundBayCount >= 2 ? upgrades.receivingRamp.cost : 0) -
      (this.bayCount >= 2 ? upgrades.shippingRamp.cost : 0)
    );
  }
  get missingEquipment() {
    return requiredUpgrades.filter(
      (id) => upgrades[id].round <= this.round && !this.purchased.includes(id),
    );
  }
  cargoFor(bay: number) {
    return this.crates.filter(
      (c) => c.loc.kind === "outbound" && (c.loc.bay ?? 0) === bay,
    );
  }
  canLoad(truck: ShippingTruck, c: Crate) {
    return (
      truck.state === "docked" &&
      ready(c, this.round) &&
      !["delivery", "delivered", "consumed", "processing"].includes(c.loc.kind)
    );
  }
  cmrAt(kind: "inbound", bay = 0) {
    return this.cmrs.find(
      (m) =>
        m.kind === kind &&
        m.bay === bay &&
        ["docked", "arriving", "departing"].includes(m.state),
    );
  }
  shippingAt(bay = 0) {
    return this.trucks.find((m) => m.bay === bay);
  }
  ensureFleet() {
    if (
      this.status !== "playing" ||
      (!this.storyMode &&
        this.round < cfg.vehicles.freeFirstOwnedVehicleAtRound)
    )
      return;
    for (
      let index = this.trucks.length;
      index < this.ownedVehicleCount;
      index++
    ) {
      const bay = Array.from({ length: this.bayCount }, (_, bay) => bay).find(
        (bay) => !this.shippingAt(bay),
      );
      if (bay === undefined) break;
      this.trucks.push({
        id: `shipping-${index}`,
        vehicle: `Własny ${index + 1}`,
        kind: "outbound",
        capacity: this.fleetCapacity[index],
        bay,
        color: null,
        state: "waiting",
        timer: 0,
      });
    }
    for (const truck of this.trucks) {
      if (truck.state !== "waiting") continue;
      const bay = [
        truck.bay,
        ...Array.from({ length: this.bayCount }, (_, bay) => bay),
      ].find(
        (bay) =>
          (!this.shippingAt(bay) || bay === truck.bay) &&
          !this.vehicleBusy("outbound", bay),
      );
      if (bay !== undefined) {
        truck.bay = bay;
        truck.state = this.tripHistory.some(
          (trip) =>
            trip.round === this.round && trip.vehicleId === truck.vehicle,
        )
          ? "arriving"
          : "docked";
        truck.timer = truck.state === "arriving" ? 1 : 0;
      }
    }
  }
  startRound() {
    if (storyEvents[this.round]) this.noteStory("round-" + this.round);
    this.cmrs = [
      ...this.config.arrivals,
      ...Object.values(this.contractLoads).filter(
        (offer) =>
          this.contracts[offer.id] === "accepted" &&
          offer.pallets[0].dispatchRound === this.round,
      ),
    ].map((m) => ({
      ...m,
      kind: "inbound",
      state: "waiting",
      bay: 0,
      timer: 0,
    }));
    this.trucks = [];
    this.shipped = [];
    this.developmentRound = 0;
    this.ledgerStart = this.ledger.length;
    this.roundMetrics = { damaged: 0, returns: 0, priorityIds: [], bonus: 0 };
    this.settlement = null;
    this.roundStarted = this.time;
    this.roundStartCash = this.cash;
    this.inbound = "waiting";
    this.outbound = "absent";
    this.message = this.config.description;
    for (const c of this.crates) c.active = dispatchRound(c) <= this.round;
    this.ensureFleet();
    this.syncVehicles();
  }
  createPallet(p: PalletSpec, loc: Location): Crate {
    return {
      ...structuredClone(p),
      active: dispatchRound(p) <= this.round,
      paid: false,
      loc,
      ...(p.prioritySeconds
        ? { priority: { started: this.time, duration: p.prioritySeconds } }
        : {}),
    };
  }
  vehicleBusy(kind: "inbound" | "outbound", bay: number) {
    const y = this.rampRow(bay);
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
      bay >= this.inboundBayCount ||
      this.cmrAt(m.kind, bay)
    )
      return false;
    if (this.missingEquipment.length) {
      this.message =
        "Przygotuj wymagany sprzęt w rozwoju przed przyjęciem dostawy.";
      return false;
    }
    // A rig still inside an empty trailer prevents replacement.
    if (this.vehicleBusy(m.kind, bay)) return false;
    m.bay = bay;
    m.state = "arriving";
    m.timer = 1;
    if (m.kind === "inbound") {
      const pallets = this.contractOffer(m.id)?.pallets ?? this.config.pallets;
      for (const [i, id] of m.palletIds.entries()) {
        if (this.crates.some((c) => c.id === id))
          throw Error("Ponowne przyjęcie palety");
        this.crates.push(
          this.createPallet(
            pallets.find((p) => p.id === id)!,
            this.locateSlot({
              kind: "inbound",
              lane: i % 2,
              depth: Math.floor(i / 2),
              bay,
            }),
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
      om = this.shippingAt();
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
      w.status = this.status;
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
    const m =
      l.kind === "outbound"
        ? this.shippingAt(l.bay ?? 0)
        : this.cmrAt("inbound", l.bay ?? 0);
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
  freeFor(worker: Game, ignore?: string, extra?: Point, reserveEdge = true) {
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
      const step = w.task?.steps[0];
      if (reserveEdge && step && w.task!.elapsed > 1e-8)
        for (const p of sweptCells(step.a, step.b, step.loaded))
          blocked.add(key(p));
    }
    return (p: Point) => {
      const vehicle = this.vehicles.some(
        (m) =>
          m.state === "docked" &&
          p.y >= this.rampRow(m.bay) &&
          p.y < this.rampRow(m.bay) + 2 &&
          (m.kind === "inbound"
            ? p.x >= -m.capacity / 2 && p.x < 0
            : p.x >= 20 && p.x < 20 + m.capacity / 2),
      );
      return (
        (this.contains(p) || vehicle) &&
        !this.sorters.some((sorter) => same(sorter, p)) &&
        !this.isClutter(p) &&
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
    const live = this.freeFor(w, ignore, undefined, false),
      cells = new Set<string>();
    for (
      let x = -5;
      x <
      cfg.map.columns +
        Math.max(5, ...this.fleetCapacity.map((capacity) => capacity / 2));
      x++
    )
      for (let y = this.minY; y < 4; y++)
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
      this.contains(p) &&
      !rampAt(this.levels, p) &&
      !(p.x === 0 || p.x === 19) &&
      !this.workers.some(
        (other) =>
          other !== w &&
          other.task?.dest.kind === "floor" &&
          same(other.task.dest, p),
      ) &&
      this.freeFor(w)(p)
    );
  }
  isClutter(p: Point) {
    return this.clutter.some((cell) => same(cell, p));
  }
  clean(p: Point) {
    const worker = this.activeWorker;
    if (
      this.status !== "playing" ||
      !this.isClutter(p) ||
      this.cleaning ||
      this.cash < cleaningCost ||
      worker.task ||
      worker.carried ||
      this.queue(this.workerIndex).length
    )
      return false;
    const approach = [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y - 1 },
      { x: p.x, y: p.y + 1 },
    ].find((cell) => worker.moveTo(cell));
    if (!approach) {
      this.message =
        "Brak bezpiecznego dojścia do sąsiedniego pola przeszkody.";
      return false;
    }
    this.cleaning = { worker: this.workerIndex, target: { ...p }, approach };
    return true;
  }
  private finishCleaning() {
    const pending = this.cleaning;
    if (!pending) return;
    const worker = this.workers[pending.worker];
    if (worker.task) return;
    if (!same(worker.pose, pending.approach) || this.cash < cleaningCost) {
      this.cleaning = null;
      return;
    }
    pending.startedAt ??= this.time;
    if (this.time - pending.startedAt < 2) return;
    this.cleaning = null;
    this.clutter = this.clutter.filter((cell) => !same(cell, pending.target));
    this.money(-cleaningCost, "Sprzątanie magazynu");
  }
  override storage(p: Point) {
    return this.storageFor(this, p);
  }
  override contains(p: Point) {
    return hasFloor(this.levels, p);
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
  thermalBonuses: string[] = [];
  contracts: Record<string, "accepted" | "rejected" | "fulfilled" | "failed"> =
    {};
  offers(round: number) {
    if (round < (this.storyMode ? 2 : 4) || (round > 30 && !this.storyMode))
      return [];
    const narrative = this.storyMode
      ? storyOffers(round, (id) => this.contracts[id] === "fulfilled")
      : [];
    const baseCount = round < 11 ? 2 : round < 21 ? 3 : 4;
    const types = [
      "stock",
      "express",
      ...(this.sorters.length ? ["mix"] : []),
      ...(this.coldCells.length ? ["cold"] : []),
      ...(this.purchased.includes("freezer") ? ["frozen"] : []),
      ...(this.purchased.includes("service") ? ["service"] : []),
    ];
    return [
      ...narrative,
      ...Array.from(
        { length: round < 11 || round > 30 ? 1 : round < 21 ? 2 : 3 },
        (_, index) => {
          const id = "CMR-" + round + "-SPEC-" + (index + 1);
          const type = types[(round + index) % types.length];
          const count =
            type === "mix" && baseCount % 2 ? baseCount + 1 : baseCount;
          const color = (["red", "blue", "green", "yellow"] as const)[
            (round + index) % 4
          ];
          const pallets: PalletSpec[] = Array.from(
            { length: count },
            (_, i) => ({
              id: id + "-P" + (i + 1),
              color,
              destinationColor: color,
              dispatchRound: round,
              dueRound: round,
              temperature:
                type === "cold"
                  ? "chilled"
                  : type === "frozen"
                    ? "frozen"
                    : "standard",
              condition:
                type === "service"
                  ? i % 2
                    ? "return"
                    : "damaged"
                  : "standard",
              ...(type === "express" ? { prioritySeconds: 1200 } : {}),
            }),
          );
          const recipes =
            type === "mix"
              ? Array.from({ length: count / 2 }, (_, index) => {
                  const pair = pallets.slice(index * 2, index * 2 + 2);
                  const outputs = pair.map((p) => ({
                    ...p,
                    id: p.id + "-SORT",
                  }));
                  pair.forEach((p) => {
                    p.mix = [{ color, cartons: 4 }];
                  });
                  return {
                    id: id + "-M" + index,
                    inputs: pair.map((p) => p.id),
                    outputs,
                    cartonsIn: 8,
                    cartonsOut: 8,
                  };
                })
              : [];
          return {
            id,
            type,
            client: standardClient(round, index),
            line: "Proszę o obsługę kolejnego zamówienia zgodnie z poniższym manifestem.",
            bonus: 3 * count + 25,
            penalty: 60,
            recipes,
            pallets,
            vehicle: "SPEC-" + (index + 1),
            capacity: count + (count % 2),
            palletIds: pallets.map((p) => p.id),
          };
        },
      ),
    ];
  }
  get recipes() {
    return [
      ...this.config.recipes,
      ...this.cmrs.flatMap((m) =>
        this.contracts[m.id] === "accepted" ||
        this.contracts[m.id] === "fulfilled"
          ? (this.contractOffer(m.id)?.recipes ?? [])
          : [],
      ),
    ];
  }
  private contractCargoIds(offer: ReturnType<CampaignGame["offers"]>[number]) {
    return [
      ...offer.palletIds,
      ...(offer.recipes ?? []).flatMap((r) => r.outputs.map((p) => p.id)),
    ];
  }
  contractOffer(id: string) {
    return this.contractLoads[id];
  }
  contractLoads: Record<string, ReturnType<CampaignGame["offers"]>[number]> =
    {};
  decideContract(id: string, accept: boolean) {
    if (!["summary", "won"].includes(this.status) || this.contracts[id])
      return false;
    const offer = this.offers(this.round + 1).find((o) => o.id === id);
    if (!offer) return false;
    this.contracts[id] = accept ? "accepted" : "rejected";
    if ("client" in offer)
      this.noteStory(id + (accept ? ":accepted" : ":rejected"));
    if (accept) this.contractLoads[id] = offer;
    return true;
  }
  failContract(id: string) {
    const offer = this.contractOffer(id);
    const manifest = this.cmrs.find((m) => m.id === id);
    if (
      this.status !== "playing" ||
      this.contracts[id] !== "accepted" ||
      !offer ||
      !manifest ||
      this.crates.some(
        (c) =>
          this.contractCargoIds(offer).includes(c.id) &&
          ["outbound", "delivery", "worker"].includes(c.loc.kind),
      ) ||
      this.workers.some(
        (w) =>
          w.task?.crate && this.contractCargoIds(offer).includes(w.task.crate),
      ) ||
      (manifest.state !== "waiting" &&
        this.vehicleBusy("inbound", manifest.bay))
    )
      return false;
    this.contracts[id] = "failed";
    manifest.state = "done";
    this.sorterJobs = this.sorterJobs.filter(
      (j) => !(offer.recipes ?? []).some((r) => r.id === j.recipe),
    );
    this.crates = this.crates.filter(
      (c) =>
        !this.contractCargoIds(offer).includes(c.id) ||
        c.loc.kind === "delivered",
    );
    for (const worker of this.workers) worker.crates = this.crates;
    for (const queue of this.queues)
      if (queue)
        for (let i = queue.length - 1; i >= 0; i--)
          if (this.contractCargoIds(offer).includes(queue[i].pallet))
            queue.splice(i, 1);
    this.noteStory(id + ":failed");
    this.money(
      -("penalty" in offer && typeof offer.penalty === "number"
        ? offer.penalty
        : 60),
      "Kara kontraktowa",
    );
    return true;
  }
  private settleContracts() {
    for (const offer of Object.values(this.contractLoads)) {
      if (
        this.contracts[offer.id] !== "accepted" ||
        !(
          offer.recipes?.length
            ? offer.recipes.flatMap((r) => r.outputs.map((p) => p.id))
            : offer.palletIds
        ).every((id) =>
          this.crates.some((c) => c.id === id && c.loc.kind === "delivered"),
        )
      )
        continue;
      this.contracts[offer.id] = "fulfilled";
      this.noteStory(offer.id + ":fulfilled");
      this.money(
        offer.bonus,
        offer.type === "story" ? "Zlecenie fabularne" : "Kontrakt specjalny",
      );
    }
  }
  queues: { pallet: string; dest: Location; blocked?: boolean }[][] = [];
  queue(index: number) {
    return this.queues[index] ?? [];
  }
  private sameDestination(a: Location, b: Location) {
    const p = locationPoint(this.locateSlot(a)),
      q = locationPoint(this.locateSlot(b));
    return !!p && !!q && same(p, q);
  }
  enqueue(index: number, pallet: string, dest: Location) {
    const worker = this.workers[index],
      c = this.crates.find((item) => item.id === pallet);
    const queue = this.queues[index] ?? (this.queues[index] = []);
    if (
      !worker ||
      this.cleaning?.worker === index ||
      !c ||
      !locationPoint(c.loc) ||
      c.owner !== undefined ||
      queue.length >= 3 ||
      this.queues.some((q) =>
        q?.some(
          (job) =>
            job.pallet === pallet || this.sameDestination(job.dest, dest),
        ),
      ) ||
      this.workers.some(
        (w) => w.task && this.sameDestination(w.task.dest, dest),
      ) ||
      (dest.kind === "floor"
        ? !this.contains(dest)
        : dest.kind !== "outbound" ||
          !this.shippingAt(dest.bay)?.capacity ||
          dest.depth < 0 ||
          dest.depth >= this.shippingAt(dest.bay)!.capacity / 2)
    )
      return false;
    queue.push({ pallet, dest: this.locateSlot(dest) });
    return true;
  }
  private startQueuedOrders() {
    for (const [i, w] of this.workers.entries()) {
      const queue = this.queue(i);
      const job = queue[0];
      if (!job || w.task || w.carried || this.cleaning?.worker === i) continue;
      queue.shift();
      const previous = w.selected;
      w.selectWorker();
      if (!w.choose(job.pallet) || !w.order(job.dest)) {
        queue.unshift({ ...job, blocked: true });
        w.source = null;
      }
      w.selected = previous;
    }
  }
  validOrder(w: Game, dest: Location) {
    if (
      this.queues.some((queue) =>
        queue?.some(
          (job) =>
            job.pallet === (w.carried ?? w.source) ||
            this.sameDestination(job.dest, dest),
        ),
      )
    ) {
      w.message = "Paleta lub cel są zarezerwowane.";
      return false;
    }
    if (this.status !== "playing") return false;
    const c = this.crates.find((c) => c.id === (w.carried ?? w.source));
    if (!c) return false;
    const owner = this.workers.indexOf(w);
    if (c.owner !== undefined && c.owner !== owner) return false;
    if (dest.kind === "outbound") {
      if (
        this.workers.some((other) => {
          const slot = other.task?.dest;
          return (
            other !== w &&
            slot?.kind === "outbound" &&
            (slot.bay ?? 0) === (dest.bay ?? 0) &&
            slot.lane === dest.lane &&
            slot.depth === dest.depth
          );
        })
      ) {
        w.message = "Ten slot jest już zarezerwowany przez inne zadanie.";
        return false;
      }
      const m = this.shippingAt(dest.bay ?? 0);
      if (!m || !this.canLoad(m, c)) {
        w.message = remainingRounds(c, this.round)
          ? `Paleta czeka jeszcze ${remainingRounds(c, this.round)} rund. Wyjazd: R${dispatchRound(c)}.`
          : "Samochód musi być przy rampie, a paleta musi zakończyć sortowanie, serwis i przygotowanie temperatury.";
        return false;
      }
    }
    if (dest.kind === "floor") {
      for (const sorter of this.sorters) {
        const { input, output, input2, output2 } = sorterPorts(sorter);
        if (
          same(dest, output) ||
          same(dest, output2) ||
          ((same(dest, input) || same(dest, input2)) &&
            (!c.mix || !this.recipes.some((r) => r.inputs.includes(c.id))))
        ) {
          w.message =
            "Czerwone pole przyjmuje MIX. Zielone pole służy do odbioru.";
          return false;
        }
      }
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
        !(
          c.mix &&
          this.sorters.some((sorter) =>
            [sorterPorts(sorter).input, sorterPorts(sorter).input2].some((p) =>
              same(dest, p),
            ),
          )
        )
      ) {
        w.message = "Odłóż paletę we właściwej strefie temperatur.";
        return false;
      }
    }
    return true;
  }
  override order(dest: Location) {
    if (!this.validOrder(this, dest)) return false;
    const ok = super.order(this.locateSlot(dest));
    if (ok) this.lock(this);
    return ok;
  }
  lock(w: Game) {
    const c = this.crates.find((c) => c.id === w.task?.crate);
    if (c) c.owner = this.workers.indexOf(w);
  }
  private invest(cost: number, label: string) {
    this.ledger.push({
      time: this.time,
      amount: -cost,
      label,
      investment: true,
    });
  }
  override money(amount: number, label: string) {
    const base = amount;
    if (label === "Rozładunek" && this.task)
      amount = this.unloadReward(
        this.crates.find((c) => c.id === this.task?.crate)!,
        amount,
      );
    if (this.storyMode) {
      this.ledger.push({ time: this.time, amount, label });
      if (this.cash < 0) this.status = "lost";
    } else super.money(amount, label);
    if (base !== amount) this.ledger.at(-1)!.priorityDelta = amount - base;
  }
  zoneAt(p: Point): "standard" | "chilled" | "frozen" {
    const ys = this.purchased.includes("climate") ? [-4, -1, -8, -5] : [-4, -1];
    if (this.coldCells.some((cell) => same(cell, p))) return "chilled";
    if (!ys.includes(p.y)) return "standard";
    if (this.purchased.includes("freezer") && p.x >= 12 && p.x <= 15)
      return "frozen";
    return "standard";
  }
  get availableSorters() {
    return (
      this.purchased.filter((id) => id === "sorter").length -
      this.sorters.length
    );
  }
  buySorter() {
    if (this.upgradeUnavailable("sorter")) return false;
    this.purchased.push("sorter");
    this.invest(upgrades.sorter.cost, upgrades.sorter.name);
    return true;
  }
  get sorterNeedsPlacement() {
    return this.availableSorters > 0;
  }
  get sorterStatus() {
    if (!this.sorter)
      return this.sorterNeedsPlacement
        ? "Wybierz miejsce przeniesionego sortera"
        : "";
    const outputs = this.sorters.flatMap((site) => {
      const ports = sorterPorts(site);
      return [ports.output, ports.output2];
    });
    if (
      this.crates.some(
        (c) =>
          c.loc.kind === "floor" &&
          outputs.some((p) => same(c.loc as Point, p)),
      )
    )
      return this.sorterJobs.length
        ? "Wyjście zajęte · kolejna paleta czeka"
        : "Gotowa paleta na wyjściu";
    if (this.sorterJobs.length)
      return this.sorterJobs[0].readyAt > this.time
        ? "Sortuje"
        : "Czeka na wolne wyjście";
    if (this.crates.some((c) => c.loc.kind === "processing"))
      return "Oczekuje na kolejną paletę MIX";
    return "Gotowy do przyjęcia MIX";
  }
  sorterPlacementError(site: SorterSite) {
    if (site.d !== 0) return "Wybierz kierunek sortera.";
    const { input, output, input2, output2 } = sorterPorts(site);
    const free = this.planningFor(this);
    const occupied = new Set<string>();
    for (const w of this.workers)
      geometryFree(
        w.transportGeometry,
        (p) => {
          occupied.add(key(p));
          return true;
        },
        !!w.carried,
      );
    for (const pose of this.pendingWorkers)
      geometryFree(
        geometry(pose),
        (p) => {
          occupied.add(key(p));
          return true;
        },
        false,
      );
    if (
      ![site, input, input2, output, output2].every(
        (p) =>
          Number.isInteger(p.x) &&
          Number.isInteger(p.y) &&
          p.x >= 1 &&
          p.x <= 18 &&
          this.contains(p) &&
          free(p) &&
          !rampAt(this.levels, p) &&
          !same(p, station.service) &&
          !occupied.has(key(p)) &&
          this.zoneAt(p) === "standard" &&
          !this.sorters.some((sorter) =>
            [sorter, ...Object.values(sorterPorts(sorter))].some((q) =>
              same(p, q),
            ),
          ) &&
          !([-4, -7].includes(p.y) && (p.x <= 8 || p.x >= 11)),
      )
    )
      return "Sorter, wejście i wyjście potrzebują pięciu wolnych pól poza rampą i urządzeniami.";
    if (
      this.workers.some((w) =>
        w.task?.steps.some((step) =>
          sweptCells(step.a, step.b, step.loaded).some((p) => same(p, site)),
        ),
      )
    )
      return "Pole maszyny przecina zlecony manewr.";
    const approach = (p: Point) =>
      free(p) && !same(p, site) && !same(p, station.service);
    const open = (p: Point) => this.contains(p) && approach(p);
    const start = this.pose;
    const portReachable = (p: Point, loading: boolean) =>
      [0, 2, 4, 6].some((d) => {
        const pre = { ...offset(p, d, 2), d, mode: "push" as const };
        const at = { ...offset(p, d, 1), d, mode: "push" as const };
        const from = loading ? pre : { ...at, mode: "pull" as const };
        const to = loading ? at : { ...pre, mode: "pull" as const };
        return (
          transition(from, to, open, true) &&
          (!loading || !!findPath(pre, this.escapeGoal, open, true)) &&
          !!findPath(start, (q) => same(q, pre) && q.d === d, approach) &&
          !!findPath(
            { ...pre, mode: "pull" },
            this.escapeGoal,
            (q) => open(q) && (!loading || !same(q, p)),
            !loading,
          )
        );
      });
    if (
      ![input, input2].every((p) => portReachable(p, true)) ||
      ![output, output2].every((p) => portReachable(p, false))
    )
      return "Brak bezpiecznego podjazdu lub wycofania przy wejściu albo wyjściu.";
    const hall = (p: Point) =>
      this.contains(p) &&
      !same(p, site) &&
      !this.sorters.some((sorter) => same(sorter, p));
    const anchor = { x: 3, y: 1, d: 0 };
    const approaches = [1, 18].flatMap((x) =>
      Array.from(
        { length: x === 1 ? this.inboundBayCount : this.bayCount },
        (_, bay) => [0, 1].map((lane) => ({ x, y: this.rampRow(bay) + lane })),
      ).flat(),
    );
    if (approaches.some((p) => !findPath(anchor, (q) => same(q, p), hall)))
      return "Sorter blokuje dojazd do rampy.";
  }
  findSorterSite() {
    const candidates: SorterSite[] = [
      { x: 6, y: -3, d: 0 },
      { x: 10, y: -5, d: 0 },
      { x: 14, y: -5, d: 4 },
    ];
    for (let y = this.minY; y < 3; y++)
      for (let x = 2; x < 18; x++)
        for (const d of [0]) candidates.push({ x, y, d });
    return candidates.find((site) => !this.sorterPlacementError(site));
  }
  installSorter(site: SorterSite) {
    const relocating = this.sorterNeedsPlacement;
    const unavailable =
      relocating && ["playing", "development"].includes(this.status)
        ? undefined
        : this.upgradeUnavailable("sorter");
    const reason = unavailable ?? this.sorterPlacementError(site);
    if (reason) {
      this.message = reason;
      return false;
    }
    const machine = { x: site.x, y: site.y, d: site.d };
    if (this.sorter) this.extraSorters.push(machine);
    else this.sorter = machine;
    if (!relocating) {
      this.purchased.push("sorter");
      this.invest(upgrades.sorter.cost, upgrades.sorter.name);
    }
    return true;
  }
  processStations() {
    const ports = this.sorters.map(sorterPorts);
    for (const c of this.crates) {
      if (c.loc.kind !== "floor" || c.owner !== undefined) continue;
      if (
        !c.climateStored &&
        this.zoneAt(c.loc) === c.temperature &&
        (c.temperature === "chilled" || c.temperature === "frozen")
      ) {
        c.climateStored = true;
        if (!this.thermalBonuses.includes(c.id)) {
          this.thermalBonuses.push(c.id);
          this.money(
            c.temperature === "chilled" ? 4 : 6,
            c.temperature === "chilled" ? "Chłodzenie" : "Mrożenie",
          );
        }
      }
      if (
        same(c.loc, station.service) &&
        this.purchased.includes("service") &&
        c.condition !== "standard"
      ) {
        if (c.condition === "damaged") this.roundMetrics.damaged++;
        if (c.condition === "return") this.roundMetrics.returns++;
        this.money(5, c.condition === "return" ? "Obsługa zwrotu" : "Naprawa");
        c.condition = "standard";
        c.climateStored = c.temperature === "standard";
        this.operations++;
        this.message = `${c.id}: serwis / kontrola zwrotu zakończona.`;
      }
    }
    const available = (p: Point) =>
      this.storageFor(this, p) &&
      this.workers.every(
        (w) =>
          geometryFree(w.transportGeometry, (q) => !same(q, p), !!w.carried) &&
          !w.task?.steps.some((step) =>
            sweptCells(step.a, step.b, step.loaded).some((q) => same(q, p)),
          ),
      );
    for (const [machine, port] of ports.entries()) {
      const inputs = [port.input2, port.input];
      const outputs = [port.output, port.output2];
      const cargo = inputs.map((p) =>
        this.crates.find(
          (c) =>
            c.loc.kind === "floor" &&
            same(c.loc, p) &&
            c.owner === undefined &&
            c.mix,
        ),
      );
      const job = this.sorterJobs.find((j) => j.machine === machine);
      const recipe = this.recipes.find(
        (r) =>
          (!job || job.recipe === r.id) &&
          !this.completedRecipes.includes(r.id) &&
          cargo.every(Boolean) &&
          r.inputs.every((id) => cargo.some((c) => c?.id === id)),
      );
      if (!recipe || !outputs.every(available)) {
        if (job) this.sorterJobs.splice(this.sorterJobs.indexOf(job), 1);
        continue;
      }
      if (!job) {
        this.sorterJobs.push({
          machine,
          recipe: recipe.id,
          next: 0,
          readyAt: this.time + 2,
        });
        continue;
      }
      if (this.time < job.readyAt) continue;
      for (const c of cargo) c!.loc = { kind: "consumed" };
      for (const [i, spec] of recipe.outputs.entries()) {
        const product = this.createPallet(spec, {
          kind: "floor",
          ...outputs[i],
        });
        product.paid = true;
        product.priority = cargo.find(
          (c) => c?.id === recipe.inputs[i],
        )?.priority;
        this.crates.push(product);
      }
      this.operations += cargo.length;
      this.money(cargo.length * 4, "Przetwarzanie MIX");
      this.completedRecipes.push(recipe.id);
      this.sorterJobs.splice(this.sorterJobs.indexOf(job), 1);
    }
  }
  dispatchBay(bay = 0) {
    const truck = this.shippingAt(bay);
    const cargo = this.cargoFor(bay);
    const quote = quoteDelivery(cargo);
    if (
      this.storyMode &&
      quote &&
      quote.cost > this.cash + cargo.length * cfg.economy.deliveryRewardPerCrate
    ) {
      this.message =
        "Brak środków na rozliczenie kursu. Doładuj więcej palet lub zmień skład ładunku.";
      return false;
    }
    if (
      this.status !== "playing" ||
      truck?.state !== "docked" ||
      !quote ||
      cargo.length > truck.capacity ||
      (this.storyMode && this.round === 1 && cargo.length < truck.capacity) ||
      cargo.some((c) => !ready(c, this.round)) ||
      this.vehicleBusy("outbound", bay) ||
      this.workers.some(
        (w) =>
          w.task?.dest.kind === "outbound" && (w.task.dest.bay ?? 0) === bay,
      )
    )
      return false;
    truck.trip = {
      ...quote,
      id: `R${this.round}-${++this.tripSequence}`,
      vehicleId: truck.vehicle,
      round: this.round,
      palletIds: cargo.map((c) => c.id),
      returnAt: this.time + quote.seconds,
    };
    truck.state = "departing";
    truck.timer = 1;
    this.syncVehicles();
    return true;
  }
  private recordPriority(c: Crate, base: number) {
    if (
      !c.priority ||
      priorityMultiplier(c, this.time) < 1 ||
      this.ledger.some(
        (entry) =>
          "priorityPalletId" in entry && entry.priorityPalletId === c.id,
      )
    )
      return base;
    this.roundMetrics.priorityIds.push(c.id);
    this.roundMetrics.bonus += 8;
    Game.prototype.money.call(this, 8, "Premia priorytetowa");
    Object.assign(this.ledger.at(-1)!, {
      priorityPalletId: c.id,
      priorityDelta: 8,
    });
    return base;
  }
  unloadReward(c: Crate, amount: number) {
    return this.recordPriority(c, amount);
  }
  private finishDelivery(truck: ShippingTruck, cargo: Crate[]) {
    const trip = truck.trip;
    for (const c of cargo) {
      c.loc = { kind: "delivered" };
      this.shipped.push(c.id);
      const base = cfg.economy.deliveryRewardPerCrate;
      const amount = this.recordPriority(c, base);
      this.money(amount, "Dostawa");
      this.ledger.at(-1)!.priorityDelta = amount - base;
    }
    if (trip) {
      this.money(-trip.cost, `Kurs ${trip.id}`);
      this.ledger.at(-1)!.tripId = trip.id;
      this.tripHistory.push(trip);
    }
    this.settleContracts();
    delete truck.trip;
    truck.color = null;
    delete truck.legacyMixed;
    truck.state = "waiting";
    truck.timer = 0;
  }
  private advanceShipping(dt: number) {
    for (const truck of this.trucks) {
      if (truck.state === "arriving" || truck.state === "departing") {
        truck.timer -= dt;
        if (truck.timer > 1e-8) continue;
        if (truck.state === "arriving") {
          truck.state = this.vehicleBusy("outbound", truck.bay)
            ? "waiting"
            : "docked";
          continue;
        }
        const cargo = this.cargoFor(truck.bay);
        if (!truck.trip) {
          // An old save can contain a one-second departure under the former rules.
          this.finishDelivery(truck, cargo);
          continue;
        }
        for (const c of cargo) c.loc = { kind: "delivery" };
        truck.state = "in-transit";
      }
      if (
        truck.state === "in-transit" &&
        truck.trip &&
        this.time + 1e-8 >= truck.trip.returnAt
      ) {
        const ids = truck.trip.palletIds;
        this.finishDelivery(
          truck,
          this.crates.filter(
            (c) => c.loc.kind === "delivery" && ids.includes(c.id),
          ),
        );
      }
    }
    this.ensureFleet();
  }
  override dispatch() {
    return this.dispatchBay();
  }
  upgradeUnavailable(id: Upgrade): string | undefined {
    const u = upgrades[id];
    if (!u || this.status !== "development") return "Niedostępne w tej rundzie";
    if (id !== "worker" && id !== "sorter" && this.purchased.includes(id))
      return "Kupione";
    if (
      id === "worker" &&
      this.workers.length + this.pendingWorkers.length >= 4
    )
      return "Komplet pracowników";
    if (
      [
        "expansion",
        "expansion2",
        "ramps",
        "receivingRamp",
        "shippingRamp",
        "receivingRamp3",
        "shippingRamp3",
      ].includes(id)
    )
      return "Rozbuduj odpowiednią strefę";
    if (this.cash < u.cost) return "Brak pieniędzy";
    if (
      ["chiller", "freezer", "service"].includes(id) &&
      this.levels.storage < 2
    )
      return "Wymaga magazynu LV2";
    if (id === "climate" && this.levels.storage < 3)
      return "Wymaga magazynu LV3";
  }
  buy(id: Upgrade) {
    if (id === "chiller") return this.buyColdPack();
    const reason = this.upgradeUnavailable(id);
    if (reason) {
      this.message = reason;
      return false;
    }
    if (id === "sorter") {
      this.message = "Wskaż miejsce ustawienia sortera.";
      return false;
    }
    const u = upgrades[id];
    if (id === "worker") {
      const candidates: Pose[] = [
        { x: 17, y: 1, d: 4 },
        { x: 9, y: 0, d: 0 },
        { x: 10, y: -6, d: 0 },
        ...[0, 1, 2, 3].flatMap((y) =>
          [4, 8, 12, 16].map((x) => ({ x, y, d: 0 })),
        ),
      ];
      const occupied = new Set<string>();
      for (const p of this.pendingWorkers)
        geometryFree(
          geometry(p),
          (cell) => {
            occupied.add(key(cell));
            return true;
          },
          false,
        );
      const free = this.free();
      const pose = candidates.find((p) =>
        geometryFree(
          geometry(p),
          (cell) => free(cell) && !occupied.has(key(cell)),
          false,
        ),
      );
      if (!pose) {
        this.message =
          "Zwolnij miejsca startowe pracowników przy górnym przejeździe.";
        return false;
      }
      this.pendingWorkers.push({ ...pose });
    }
    const cost = id === "ramps" ? this.rampUpgradeCost : u.cost;
    this.purchased.push(id);
    this.invest(cost, u.name);
    return true;
  }
  override get coordinatedMovement() {
    return this.workers.length > 1;
  }
  private trafficWait = new WeakMap<Game, number>();
  private trafficRecoveryAt = 0;
  private reroute(w: Game) {
    const task = w.task;
    if (
      !task ||
      (task.trafficReroutes ?? 0) >= 4 ||
      task.elapsed > 1e-8 ||
      task.cancelRequested ||
      task.inserted ||
      task.deposited
    )
      return;
    const loaded = !!w.carried;
    const free = this.planningFor(w, w.carried ?? undefined);
    const operation = task.steps.findIndex((step) =>
      [
        "INSERT_FORKS",
        "LIFT",
        "PUSH_TO_TARGET",
        "LOWER",
        "WITHDRAW_FORKS",
      ].includes(step.phase),
    );
    const end = operation < 0 ? task.steps.length : operation;
    if (!end) return;
    const goal = task.steps[end - 1].b;
    const route = findPath(
      w.pose,
      (p) => poseKey(p) === poseKey(goal),
      free,
      loaded,
    );
    if (
      !route ||
      route.length < 2 ||
      poseKey(route[1]) === poseKey(task.steps[0].b)
    )
      return;
    task.steps = [
      ...route.slice(1).map((p, i) => travel(route[i], p, loaded)),
      ...task.steps.slice(end),
    ];
    task.blocked = false;
    task.trafficReroutes = (task.trafficReroutes ?? 0) + 1;
    w.updateRoute();
    w.message = "Znaleziono bezpieczne obejście.";
  }
  private nextEdgeBlockedBy(worker: Game, other: Game) {
    const step = worker.task?.steps[0];
    if (!step) return false;
    const occupied = new Set<string>();
    geometryFree(
      other.transportGeometry,
      (p) => {
        occupied.add(key(p));
        return true;
      },
      !!other.carried,
    );
    return sweptCells(step.a, step.b, step.loaded).some((p) =>
      occupied.has(key(p)),
    );
  }
  private yieldInDeadlock(worker: Game) {
    const cycleFrom = (path: Game[]): Game[] | undefined => {
      for (const next of this.workers) {
        if (
          !next.task?.blocked ||
          next === path.at(-1) ||
          !this.nextEdgeBlockedBy(path.at(-1)!, next)
        )
          continue;
        if (next === worker) return path;
        if (path.includes(next)) continue;
        const cycle = cycleFrom([...path, next]);
        if (cycle) return cycle;
      }
    };
    const cycle = cycleFrom([worker]);
    if (!cycle) return;
    // An empty rig can clear the passage without interrupting a carried load.
    const candidates = [...cycle].sort(
      (a, b) => this.workers.indexOf(b) - this.workers.indexOf(a),
    );
    for (const yielding of candidates) {
      const task = yielding.task!;
      if (
        yielding.carried ||
        task.elapsed > 1e-8 ||
        task.inserted ||
        task.deposited ||
        task.cancelRequested ||
        task.yielded
      )
        continue;
      const passage = new Set(
        cycle
          .filter((w) => w !== yielding)
          .flatMap((w) =>
            w
              .task!.steps.slice(0, 2)
              .flatMap((s) => sweptCells(s.a, s.b, s.loaded).map(key)),
          ),
      );
      const start = rig(yielding.pose);
      const free = this.planningFor(yielding);
      const escape = findPath(
        start,
        (p) =>
          !same(p, start) &&
          this.contains(p) &&
          Math.abs(p.x - start.x) + Math.abs(p.y - start.y) <= 5 &&
          geometryFree(
            geometry(p),
            (cell) => free(cell) && !passage.has(key(cell)),
            false,
          ),
        free,
      );
      if (!escape) continue;
      const parking = escape.at(-1)!;
      const back = findPath(
        parking,
        (p) => poseKey(p) === poseKey(start),
        free,
      );
      if (!back) continue;
      task.steps = [
        ...escape.slice(1).map((p, i) => travel(escape[i], p, false)),
        { ...travel(parking, parking, false, "YIELD"), duration: 2 },
        ...back.slice(1).map((p, i) => travel(back[i], p, false)),
        ...task.steps,
      ];
      task.yielded = true;
      task.blocked = false;
      yielding.updateRoute();
      yielding.message = "Ustępuje, by zwolnić przejazd.";
      return true;
    }
  }
  private moveWorkers(dt: number) {
    const ordered = [...this.workers].sort(
      (a, b) =>
        Number((b.task?.elapsed ?? 0) > 1e-8) -
          Number((a.task?.elapsed ?? 0) > 1e-8) ||
        (this.trafficWait.get(b) ?? 0) - (this.trafficWait.get(a) ?? 0) ||
        Number(!!b.carried) - Number(!!a.carried),
    );
    const time = this.time;
    for (const w of ordered) {
      w.time = time;
      const step = w.task?.steps[0];
      const scale =
        this.usesPiesek && w.carried && step && step.phase !== "LOWER"
          ? 1.5
          : 1;
      if (w === this) super.step(dt * scale);
      else w.step(dt * scale);
      w.time = time;
      if (!w.task?.blocked) {
        this.trafficWait.delete(w);
        continue;
      }
      const wait = (this.trafficWait.get(w) ?? 0) + dt;
      this.trafficWait.set(w, wait);
      if (w.task.blocked)
        w.message =
          wait >= 4
            ? "Przejazd zablokowany. Zwolnij miejsce przed pracownikiem."
            : "Czeka na bezpieczny przejazd.";
    }
    if (this.workers.length > 1 && time >= this.trafficRecoveryAt) {
      const waiting = ordered.filter(
        (w) => w.task?.blocked && (this.trafficWait.get(w) ?? 0) >= 0.75,
      );
      if (waiting.length) {
        this.trafficRecoveryAt = time + 2;
        if (!waiting.some((w) => this.yieldInDeadlock(w)))
          this.reroute(waiting[0]);
      }
    }
  }
  override step(dt: number) {
    if (this.status !== "playing") return;
    // Reuse the complete 0.1 transport execution, including collision checks and fork withdrawal.
    this.startQueuedOrders();
    this.moveWorkers(dt);
    this.finishCleaning();
    this.time = Math.round((this.time + dt) * 1e6) / 1e6;
    for (const w of this.workers) w.time = this.time;
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
        !this.workers.some(
          (w) => w.task && m.palletIds.includes(w.task.crate ?? ""),
        )
      ) {
        m.state = "departing";
        m.timer = 1;
      }
    }
    this.advanceShipping(dt);
    this.syncVehicles();
    if (this.mandatoryComplete)
      for (const w of this.workers)
        if (w.task?.crate === null && !w.task.cancelRequested) w.cancel();
    this.completeRound();
  }
  private get mandatoryComplete() {
    return (
      this.status === "playing" &&
      !this.settled.includes(this.round) &&
      !this.cleaning &&
      this.queues.every((queue) => !queue?.length) &&
      this.workers.every(
        (w) => !w.carried && (!w.task || w.task.crate === null),
      ) &&
      this.trucks.every(
        (t) => !t.trip && t.state !== "departing" && t.state !== "arriving",
      ) &&
      this.cmrs.every((m) => m.state === "done") &&
      this.recipes.every((r) => this.completedRecipes.includes(r.id)) &&
      this.stock.length === this.config.expectedStock &&
      !this.cmrs.some((m) => this.contracts[m.id] === "accepted") &&
      this.stock.every(
        (c) =>
          dispatchRound(c) > this.round &&
          c.loc.kind === "floor" &&
          !c.mix &&
          c.condition === "standard" &&
          (c.temperature === "standard" ||
            this.zoneAt(c.loc) === c.temperature),
      )
    );
  }
  get roundReady() {
    return this.mandatoryComplete && this.workers.every((w) => !w.task);
  }
  roundReport() {
    const entries = this.ledger
      .slice(this.ledgerStart)
      .filter((entry) => !entry.investment);
    const sum = (filter: (e: (typeof entries)[number]) => boolean) =>
      entries.filter(filter).reduce((n, e) => n + e.amount, 0);
    const received = [
      ...this.config.pallets,
      ...Object.values(this.contractLoads)
        .filter(
          (offer) =>
            offer.pallets[0]?.dispatchRound === this.round &&
            this.contracts[offer.id] !== "rejected",
        )
        .flatMap((offer) => offer.pallets),
    ].filter((p) =>
      this.crates.some((c) => c.id === p.id && c.loc.kind !== "inbound"),
    );
    const currentBonus = entries.reduce(
      (n, e) => n + (e.priorityDelta ?? 0),
      0,
    );
    const legacyBonus = this.roundMetrics.bonus - currentBonus;
    const revenue = new Map<string, number>();
    for (const e of entries)
      if (e.amount > 0)
        revenue.set(
          e.label,
          (revenue.get(e.label) ?? 0) + e.amount - (e.priorityDelta ?? 0),
        );
    if (legacyBonus)
      revenue.set("Korekta przychodów ze starszego zapisu", -legacyBonus);
    const wages = -sum((e) => e.label.startsWith("Pensja"));
    const ramps = -sum((e) => e.label.startsWith("Rampy —"));
    const transport = -sum((e) => !!e.tripId);
    const income = sum((e) => e.amount > 0) - this.roundMetrics.bonus;
    const operatingExpenses = new Map<string, number>();
    for (const entry of entries) {
      if (
        entry.amount >= 0 ||
        entry.tripId ||
        entry.label.startsWith("Pensja") ||
        entry.label.startsWith("Rampy —")
      )
        continue;
      operatingExpenses.set(
        entry.label,
        (operatingExpenses.get(entry.label) ?? 0) - entry.amount,
      );
    }
    const costs = [...operatingExpenses.values()].reduce(
      (total, amount) => total + amount,
      0,
    );
    const roundInvestment = this.ledger
      .slice(this.ledgerStart)
      .filter((entry) => entry.investment)
      .reduce((sum, entry) => sum + entry.amount, 0);
    return {
      revenue: [...revenue],
      before: this.roundStartCash + roundInvestment,
      workers: this.workers.length,
      rampCount: this.rampCount,
      ramps,
      transport,
      trips: structuredClone(
        this.tripHistory.filter((t) => t.round === this.round),
      ),
      income,
      operatingExpenses: [...operatingExpenses],
      totalRevenue: income + this.roundMetrics.bonus,
      totalCosts: wages + ramps + transport + costs,
      bonus: this.roundMetrics.bonus,
      wages,
      costs,
      net: this.cash - this.roundStartCash - roundInvestment,
      cash: this.cash,
      received: received.length,
      sent: this.shipped.length,
      stock: this.stock.length,
      arrivals: this.cmrs.filter((m) => m.state === "done").length,
      mixed: this.config.recipes
        .filter((r) => this.completedRecipes.includes(r.id))
        .reduce((n, r) => n + r.inputs.length, 0),
      chilled: received.filter((p) => p.temperature === "chilled").length,
      frozen: received.filter((p) => p.temperature === "frozen").length,
      damaged: this.roundMetrics.damaged,
      returns: this.roundMetrics.returns,
      priority: this.roundMetrics.priorityIds.length,
    };
  }
  completeRound() {
    if (!this.roundReady) return false;
    this.settled.push(this.round);
    this.money(
      this.stock.length * cfg.economy.storageRewardPerCratePerCompletedRound,
      "Przechowanie",
    );
    this.money(
      -cfg.economy.workerWagePerRound * this.workers.length,
      `Pensja — runda ${this.round}`,
    );
    this.money(
      -cfg.economy.rampCostPerRound * this.rampCount,
      `Rampy — runda ${this.round}`,
    );
    const maintenance = [
      [
        "Moduły",
        8 * Object.values(this.levels).reduce((n, level) => n + level - 1, 0),
      ],
      ["Miksery MIX", 12 * (this.sorters.length + this.availableSorters)],
      ["Chłodnia", 6 * Math.ceil((this.coldStock + this.coldCells.length) / 4)],
      [
        "Mroźnia",
        this.purchased.includes("freezer")
          ? this.purchased.includes("climate")
            ? 36
            : 18
          : 0,
      ],
      ["Piesek", this.usesPiesek ? 7 : 0],
      ["Dodatkowe auta", 10 * Math.max(0, this.ownedVehicleCount - 1)],
    ] as const;
    for (const [label, cost] of maintenance)
      if (cost) this.money(-cost, "Utrzymanie · " + label);
    if (this.storyMode)
      for (const offer of this.offers(this.round + 1)) {
        if (!("client" in offer)) continue;
        if (this.storyHistory["client:" + offer.client] !== undefined)
          this.noteStory(offer.id + ":returned");
        this.noteStory("client:" + offer.client);
        this.noteStory(offer.id + ":offered");
      }
    this.settlement = this.roundReport();
    if (this.status === "playing")
      this.status = this.round === 30 ? "won" : "summary";
    this.syncVehicles();
    return true;
  }
  beginDevelopment() {
    if (
      (this.status === "summary" && (this.storyMode || this.round < 30)) ||
      (this.storyMode && this.status === "won" && this.round === 30)
    ) {
      this.developmentRound = this.round + 1;
    } else if (
      this.status === "playing" &&
      this.missingEquipment.length &&
      this.cmrs.every((m) => m.state === "waiting") &&
      this.trucks.every((t) => !t.trip && !this.cargoFor(t.bay).length) &&
      !this.workers.some((w) => w.task || w.carried)
    ) {
      this.developmentRound = this.round;
    } else return false;
    this.status = "development";
    this.syncVehicles();
    return true;
  }
  override nextRound() {
    if (
      this.status !== "development" ||
      this.developmentRound < this.round ||
      (!this.storyMode && this.developmentRound > 30)
    )
      return;
    for (const pose of this.pendingWorkers) {
      const w = new WarehouseWorker(this);
      w.pose = { ...pose };
      this.workers.push(w);
    }
    this.pendingWorkers = [];
    const next = this.developmentRound;
    this.developmentRound = 0;
    this.status = "playing";
    if (next !== this.round) {
      if (this.pendingFleet) this.fleetCapacity = this.pendingFleet;
      this.pendingFleet = null;
      this.round = next;
      this.startRound();
    }
    this.ensureFleet();
    this.syncVehicles();
  }
  override assertInvariant() {
    if (
      !Number.isFinite(this.cash) ||
      !Number.isFinite(this.time) ||
      this.round < 1 ||
      !Number.isSafeInteger(this.round) ||
      (!this.storyMode && this.round > 30)
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
          (!this.contains(p) || p.x < 1 || p.x >= 19 || rampAt(this.levels, p))
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
          ? (w.task.crate ?? undefined)
          : undefined);
      if (
        !geometryFree(
          w.transportGeometry,
          this.freeFor(w, ignore, undefined, false),
          !!w.carried,
        )
      )
        throw Error("Kolizja zestawu pracownika");
    }
    if (
      !Array.isArray(this.fleetCapacity) ||
      !Array.isArray(this.plannedFleet) ||
      this.fleetCapacity.length < 1 ||
      this.plannedFleet.length > this.bayCount ||
      this.plannedFleet.length < this.fleetCapacity.length ||
      [...this.fleetCapacity, ...this.plannedFleet].some(
        (capacity) =>
          !Number.isSafeInteger(capacity) || capacity < 4 || capacity % 2,
      )
    )
      throw Error("Niespójna ładowność floty");
    if (
      new Set(this.shipped).size !== this.shipped.length ||
      this.shipped.some(
        (id) =>
          !this.crates.some((c) => c.id === id && c.loc.kind === "delivered"),
      )
    )
      throw Error("Niespójna lista wysłanych palet");
    const charges = new Map<string, number>();
    for (const entry of this.ledger) {
      if (!entry.tripId) continue;
      if (charges.has(entry.tripId)) throw Error("Podwójny koszt kursu");
      charges.set(entry.tripId, entry.amount);
    }
    const tripIds = new Set<string>();
    for (const trip of this.tripHistory) {
      if (tripIds.has(trip.id) || charges.get(trip.id) !== -trip.cost)
        throw Error("Niespójne rozliczenie kursu");
      tripIds.add(trip.id);
    }
    if (tripIds.size !== charges.size) throw Error("Koszt bez kursu");
    const travelling = new Set<string>();
    const bays = new Set<number>();
    for (const truck of this.trucks) {
      if (bays.has(truck.bay) || truck.bay < 0 || truck.bay >= this.bayCount)
        throw Error("Nieprawidłowe stanowisko samochodu");
      const pallets = this.cargoFor(truck.bay);
      if (
        pallets.some(
          (c) =>
            c.loc.kind === "outbound" &&
            (c.loc.depth < 0 ||
              c.loc.depth >= truck.capacity / 2 ||
              c.loc.lane < 0 ||
              c.loc.lane > 1),
        )
      )
        throw Error("Paleta poza stanowiskiem ładunkowym");
      bays.add(truck.bay);
      const trip = truck.trip;
      if (!trip) {
        if (truck.state === "in-transit") throw Error("Brak danych kursu");
        continue;
      }
      const cargo =
        truck.state === "departing"
          ? this.cargoFor(truck.bay)
          : this.crates.filter(
              (c) => c.loc.kind === "delivery" && trip.palletIds.includes(c.id),
            );
      const quote = quoteDelivery(cargo);
      if (
        tripIds.has(trip.id) ||
        trip.round !== this.round ||
        !["departing", "in-transit"].includes(truck.state) ||
        !Number.isFinite(trip.returnAt) ||
        cargo.length !== trip.palletIds.length ||
        cargo.length > truck.capacity ||
        cargo.some(
          (c) => !trip.palletIds.includes(c.id) || travelling.has(c.id),
        ) ||
        !quote ||
        quote.seconds !== trip.seconds ||
        quote.cost !== trip.cost ||
        quote.colors.length !== trip.colors.length ||
        quote.colors.some((color) => !trip.colors.includes(color))
      )
        throw Error("Niespójny ładunek kursu");
      tripIds.add(trip.id);
      for (const c of cargo) travelling.add(c.id);
    }
    if (
      this.crates.some(
        (c) => c.loc.kind === "delivery" && !travelling.has(c.id),
      )
    )
      throw Error("Paleta bez kursu");
    return true;
  }
}
class WarehouseWorker extends Game {
  hub: CampaignGame;
  override get coordinatedMovement() {
    return this.hub.coordinatedMovement;
  }
  override transportOnly = true;
  constructor(hub: CampaignGame) {
    super();
    this.hub = hub;
    this.crates = hub.crates;
  }
  override cancel() {
    this.hub.cancelCleaning(this.hub.workers.indexOf(this));
    super.cancel();
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
    const ok = super.order(this.hub.locateSlot(dest));
    if (ok) this.hub.lock(this);
    return ok;
  }
  private invest(cost: number, label: string) {
    this.ledger.push({
      time: this.time,
      amount: -cost,
      label,
      investment: true,
    });
  }
  override money(amount: number, label: string) {
    const base = amount;
    if (label === "Rozładunek")
      amount = this.hub.unloadReward(
        this.crates.find((c) => c.id === this.task?.crate)!,
        amount,
      );
    Game.prototype.money.call(this.hub, amount, label);
    if (base !== amount) this.hub.ledger.at(-1)!.priorityDelta = amount - base;
  }
}
export { WarehouseWorker };
