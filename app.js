const appState = {
  activeEvent: "normal",
  eventFilter: "ALL",
  selectedEquipment: null,
  editWiring: false,
  drag: null,
  wiring: null,
  commLostAt: null,
  audit: [],
  ui: { sourceCollapsed: false, bottomCollapsed: false },
};

const substations = [
  {
    id: "catbalogan",
    name: "CATBALOGAN",
    code: "CAT",
    transformers: [
      {
        id: "cat-t1",
        name: "T1",
        capacity: 10,
        load: 6.8,
        hv: 69.12,
        lv: 13.78,
        current: 284,
        pf: 0.97,
        temp: 53,
        energized: true,
        fan: "RUNNING",
        breaker: "CLOSED",
        comm: "ONLINE",
      },
      {
        id: "cat-t2",
        name: "T2",
        capacity: 5,
        load: 0,
        hv: 0,
        lv: 0,
        current: 0,
        pf: 0,
        temp: 31,
        energized: false,
        fan: "STOPPED",
        breaker: "OPEN",
        comm: "ONLINE",
      },
    ],
  },
  {
    id: "main",
    name: "MAIN",
    code: "MAIN",
    transformers: [
      {
        id: "main-t1",
        name: "T1",
        capacity: 10,
        load: 5.4,
        hv: 69.08,
        lv: 13.76,
        current: 226,
        pf: 0.96,
        temp: 49,
        energized: true,
        fan: "RUNNING",
        breaker: "CLOSED",
        comm: "ONLINE",
      },
    ],
  },
  {
    id: "villareal",
    name: "VILLAREAL",
    code: "VIL",
    transformers: [
      {
        id: "vil-t1",
        name: "T1",
        capacity: 5,
        load: 3.1,
        hv: 69.05,
        lv: 13.75,
        current: 132,
        pf: 0.95,
        temp: 47,
        energized: true,
        fan: "RUNNING",
        breaker: "CLOSED",
        comm: "ONLINE",
      },
    ],
  },
  {
    id: "bagolibas",
    name: "BAGOLIBAS",
    code: "BAG",
    transformers: [
      {
        id: "bag-t1",
        name: "T1",
        capacity: 5,
        load: 3.4,
        hv: 69.02,
        lv: 13.74,
        current: 146,
        pf: 0.96,
        temp: 48,
        energized: true,
        fan: "RUNNING",
        breaker: "CLOSED",
        comm: "ONLINE",
      },
    ],
  },
];

const baseFeeders = Array.from({ length: 15 }, (_, index) => {
  const number = index + 1;
  const transformerId = SCADATopology.draftFeederLinks[`feeder-${number}`];
  const transformer = substations.flatMap((s) =>
    s.transformers.map((t) => ({ substation: s.name, transformer: t }))
  ).find((entry) => entry.transformer.id === transformerId);
  const siblings = Object.entries(SCADATopology.draftFeederLinks)
    .filter(([, parentId]) => parentId === transformerId).map(([id]) => id);
  const position = siblings.indexOf(`feeder-${number}`);
  const weight = 1 + (position - (siblings.length - 1) / 2) * 0.06;
  const nominalLoad = transformer.transformer.load || (transformerId === "cat-t2" ? 2.1 : 0);
  const mw = nominalLoad * weight / siblings.length;
  const voltage = transformer.transformer.lv || 13.77;
  const pf = 0.95 + (number % 3) * 0.01;

  return {
    id: `feeder-${number}`,
    number,
    name: `FEEDER ${number}`,
    voltage,
    current: mw * 1000 / (Math.sqrt(3) * voltage * pf),
    mw,
    mvar: mw * Math.tan(Math.acos(pf)),
    pf,
    breaker: transformer.transformer.energized ? "CLOSED" : "OPEN",
    energized: transformer.transformer.energized,
    comm: "ONLINE",
    substation: transformer.substation,
    transformerId: transformer.transformer.id,
    transformerName: transformer.transformer.name,
  };
});

const transformerIds = substations.flatMap((s) => s.transformers.map((t) => t.id));
const feederIds = baseFeeders.map((f) => f.id);
const wiringKey = "samelco-scada-draft-wiring-v1";
const auditKey = "samelco-scada-draft-audit-v1";
const uiKey = "samelco-scada-ui-v1";
const demoEvents = ["normal", "t1Energized", "t2Off", "feederTrip", "commLost"];

function loadUIState() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(uiKey)) || {}; } catch (_) { /* Use defaults. */ }
  return {
    sourceCollapsed: saved.sourceCollapsed === true,
    bottomCollapsed: saved.bottomCollapsed === true,
    activeEvent: demoEvents.includes(saved.activeEvent) ? saved.activeEvent : "normal",
    eventFilter: ["ALL", "ALARM", "WARNING", "EVENT"].includes(saved.eventFilter) ? saved.eventFilter : "ALL",
  };
}

function saveUIState() {
  try {
    localStorage.setItem(uiKey, JSON.stringify({
      ...appState.ui,
      activeEvent: appState.activeEvent,
      eventFilter: appState.eventFilter,
    }));
  } catch (_) { /* Keep preferences for this session. */ }
}

function defaultWiring() {
  return {
    sourceLinks: Object.fromEntries(transformerIds.map((id) => [id, true])),
    feederLinks: Object.fromEntries(baseFeeders.map((f) => [f.id, f.transformerId])),
    transformerBreakers: Object.fromEntries(substations.flatMap((s) => s.transformers.map((t) => [t.id, t.breaker]))),
    feederBreakers: Object.fromEntries(baseFeeders.map((f) => [f.id, f.breaker])),
    tie: null,
  };
}

function loadWiring() {
  const defaults = defaultWiring();
  try {
    const saved = JSON.parse(localStorage.getItem(wiringKey));
    if (!saved || typeof saved !== "object") return defaults;
    for (const id of transformerIds) {
      if (typeof saved.sourceLinks?.[id] === "boolean") defaults.sourceLinks[id] = saved.sourceLinks[id];
      if (["OPEN", "CLOSED"].includes(saved.transformerBreakers?.[id])) defaults.transformerBreakers[id] = saved.transformerBreakers[id];
    }
    for (const id of feederIds) {
      if (saved.feederLinks?.[id] === null || transformerIds.includes(saved.feederLinks?.[id])) defaults.feederLinks[id] = saved.feederLinks[id];
      if (["OPEN", "CLOSED"].includes(saved.feederBreakers?.[id])) defaults.feederBreakers[id] = saved.feederBreakers[id];
    }
    if (feederIds.includes(saved.tie?.sourceId) && feederIds.includes(saved.tie?.targetId) && saved.tie.sourceId !== saved.tie.targetId) {
      defaults.tie = { sourceId: saved.tie.sourceId, targetId: saved.tie.targetId };
      defaults.feederBreakers[saved.tie.targetId] = "OPEN";
    }
  } catch (_) {
    return defaults;
  }
  return SCADATopology.validateWiring(substations, baseFeeders, defaults).length ? defaultWiring() : defaults;
}

function saveWiring() {
  try { localStorage.setItem(wiringKey, JSON.stringify(appState.wiring)); } catch (_) { /* Private browsing may block storage. */ }
}

appState.wiring = loadWiring();
const savedUI = loadUIState();
appState.ui = { sourceCollapsed: savedUI.sourceCollapsed, bottomCollapsed: savedUI.bottomCollapsed };
appState.activeEvent = savedUI.activeEvent;
appState.eventFilter = savedUI.eventFilter;
appState.commLostAt = savedUI.activeEvent === "commLost" ? Date.now() - 138000 : null;
try {
  const savedAudit = JSON.parse(localStorage.getItem(auditKey));
  if (Array.isArray(savedAudit)) appState.audit = savedAudit.filter((entry) => typeof entry?.text === "string" && typeof entry?.time === "string").slice(0, 30);
} catch (_) { /* Audit remains in memory when storage is unavailable. */ }

function recordAudit(text) {
  appState.audit.unshift({ time: new Date().toLocaleTimeString("en-SG", { hour12: false }), text });
  appState.audit.length = Math.min(appState.audit.length, 30);
  try { localStorage.setItem(auditKey, JSON.stringify(appState.audit)); } catch (_) { /* Keep the in-memory log. */ }
}

function cloneEquipment() {
  return {
    substations: structuredClone(substations),
    feeders: structuredClone(baseFeeders),
  };
}

function getScenario() {
  const scenario = cloneEquipment();
  const effectiveWiring = structuredClone(appState.wiring);

  if (appState.activeEvent === "t1Energized") {
    effectiveWiring.sourceLinks["cat-t1"] = true;
    effectiveWiring.transformerBreakers["cat-t1"] = "CLOSED";
  }
  if (appState.activeEvent === "t2Off") effectiveWiring.transformerBreakers["cat-t2"] = "OPEN";
  if (appState.activeEvent === "feederTrip") effectiveWiring.feederBreakers["feeder-10"] = "TRIPPED";

  for (const transformer of scenario.substations.flatMap((s) => s.transformers)) {
    transformer.sourceConnected = effectiveWiring.sourceLinks[transformer.id];
    transformer.breaker = effectiveWiring.transformerBreakers[transformer.id];
  }

  for (const feeder of scenario.feeders) {
    feeder.transformerId = effectiveWiring.feederLinks[feeder.id];
    const parent = feeder.transformerId
      ? scenario.substations.find((s) => s.transformers.some((t) => t.id === feeder.transformerId))
      : null;
    const transformer = parent?.transformers.find((t) => t.id === feeder.transformerId);
    feeder.substation = parent?.name || "UNASSIGNED";
    feeder.transformerName = transformer?.name || "-";
    feeder.breaker = effectiveWiring.feederBreakers[feeder.id];
  }

  if (appState.activeEvent === "commLost") {
    const transformer = findTransformer(scenario.substations, "vil-t1");
    const elapsedSeconds = Math.floor((Date.now() - (appState.commLostAt || Date.now() - 138000)) / 1000);
    const lastSeen = `${Math.floor(elapsedSeconds / 60)}m ${String(elapsedSeconds % 60).padStart(2, "0")}s ago`;
    transformer.comm = "COMM LOST";
    transformer.quality = "STALE";
    transformer.lastSeen = lastSeen;
    scenario.feeders
      .filter((feeder) => feeder.transformerId === "vil-t1")
      .forEach((feeder) => {
        feeder.comm = "COMM LOST";
        feeder.quality = "STALE";
        feeder.lastSeen = lastSeen;
      });
  }

  const topology = SCADATopology.evaluate(scenario.substations, scenario.feeders, effectiveWiring);
  scenario.topology = topology;
  for (const transformer of scenario.substations.flatMap((station) => station.transformers)) {
    transformer.energized = topology.powered.has(transformer.id);
    setTransformerPower(transformer);
  }
  for (const feeder of scenario.feeders) {
    feeder.energized = topology.powered.has(feeder.id);
    if (!feeder.energized) deenergizeFeeder(feeder);
  }
  if (appState.activeEvent === "t1Energized") {
    scenario.feeders.filter((feeder) => feeder.transformerId === "cat-t1" && feeder.energized).forEach((feeder) => {
      feeder.mw *= 7.4 / 6.8;
      feeder.mvar *= 7.4 / 6.8;
      feeder.current *= 7.4 / 6.8;
    });
  }

  if (effectiveWiring.tie) {
    const { sourceId, targetId } = effectiveWiring.tie;
    const source = scenario.feeders.find((feeder) => feeder.id === sourceId);
    const target = scenario.feeders.find((feeder) => feeder.id === targetId);
    if (source && target) {
      target.tieFrom = source.id;
      source.tieTo = target.id;
      if (target.energized) {
        const nominal = baseFeeders.find((feeder) => feeder.id === target.id);
        Object.assign(target, {
          voltage: source.voltage,
          current: nominal.mw * 1000 / (Math.sqrt(3) * source.voltage * nominal.pf),
          mw: nominal.mw,
          mvar: nominal.mvar,
          pf: nominal.pf,
        });
      }
      if (source.quality === "STALE") {
        target.comm = "COMM LOST";
        target.quality = "STALE";
        target.lastSeen = source.lastSeen;
      }
    }
  }

  const byId = new Map(scenario.feeders.map((feeder) => [feeder.id, feeder]));
  const totals = new Map();
  for (const feeder of scenario.feeders.filter((item) => item.energized)) {
    const supplier = feeder.tieFrom ? byId.get(feeder.tieFrom)?.transformerId : feeder.transformerId;
    if (!supplier) continue;
    const total = totals.get(supplier) || { mw: 0, mvar: 0 };
    total.mw += feeder.mw;
    total.mvar += feeder.mvar;
    totals.set(supplier, total);
  }
  for (const transformer of scenario.substations.flatMap((station) => station.transformers)) {
    if (!transformer.energized) continue;
    const total = totals.get(transformer.id) || { mw: 0, mvar: 0 };
    transformer.load = total.mw;
    transformer.pf = total.mw ? total.mw / Math.hypot(total.mw, total.mvar) : 0;
    transformer.current = transformer.pf ? total.mw * 1000 / (Math.sqrt(3) * transformer.lv * transformer.pf) : 0;
  }

  return scenario;
}

function findTransformer(list, id) {
  return list.flatMap((substation) => substation.transformers).find((transformer) => transformer.id === id);
}

function setTransformerPower(transformer) {
  transformer.fan = transformer.energized ? "RUNNING" : "STOPPED";
  if (transformer.energized && transformer.id === "cat-t2") {
    Object.assign(transformer, { load: 2.1, hv: 69.1, lv: 13.77, current: 88, pf: 0.96, temp: 41 });
  }
  if (transformer.energized) return;
  transformer.load = 0;
  transformer.hv = 0;
  transformer.lv = 0;
  transformer.current = 0;
  transformer.pf = 0;
}

function deenergizeFeeder(feeder) {
  feeder.voltage = 0;
  feeder.current = 0;
  feeder.mw = 0;
  feeder.mvar = 0;
  feeder.pf = 0;
}

function statusClass(item) {
  if (item.breaker === "TRIPPED") return "trip";
  if (item.comm === "COMM LOST" || item.quality === "STALE") return "stale";
  if (item.tieFrom) return item.energized ? "energized" : "off";
  if (!item.energized || item.breaker === "OPEN") return "off";
  return "energized";
}

function render() {
  const scenario = getScenario();
  document.body.classList.toggle("wiring-edit", appState.editWiring);
  document.querySelector(".main-grid").classList.toggle("source-collapsed", appState.ui.sourceCollapsed);
  document.querySelector(".source-panel").classList.toggle("collapsed", appState.ui.sourceCollapsed);
  const sourceToggle = document.getElementById("sourceToggle");
  sourceToggle.textContent = appState.ui.sourceCollapsed ? "+" : "−";
  sourceToggle.setAttribute("aria-expanded", String(!appState.ui.sourceCollapsed));
  sourceToggle.setAttribute("aria-label", appState.ui.sourceCollapsed ? "Restore NGCP panel" : "Minimize NGCP panel");
  sourceToggle.title = sourceToggle.getAttribute("aria-label");
  document.getElementById("bottomGrid").hidden = appState.ui.bottomCollapsed;
  const bottomToggle = document.getElementById("bottomToggle");
  bottomToggle.setAttribute("aria-expanded", String(!appState.ui.bottomCollapsed));
  bottomToggle.querySelector(".toggle-icon").textContent = appState.ui.bottomCollapsed ? "+" : "−";
  bottomToggle.title = appState.ui.bottomCollapsed ? "Show lower panels" : "Hide lower panels";
  document.getElementById("demoScenario").value = appState.activeEvent;
  document.querySelectorAll(".event-tabs button").forEach((button) =>
    button.classList.toggle("active", button.dataset.filter === appState.eventFilter)
  );
  document.getElementById("wiringToggle").setAttribute("aria-pressed", String(appState.editWiring));
  document.getElementById("wiringHint").hidden = !appState.editWiring;
  document.getElementById("systemComm").textContent = appState.activeEvent === "commLost"
    ? "VILLAREAL COMM LOST | DEMO"
    : "DEMO DATA | 4 substations";
  const systemState = document.getElementById("systemState");
  systemState.textContent = appState.editWiring ? "SIMULATION EDIT" : appState.activeEvent === "commLost" ? "COMM LOSS DEMO" : "READ-ONLY DEMO";
  systemState.classList.toggle("warning", appState.activeEvent === "commLost");
  renderSubstations(scenario.substations);
  renderFeeders(scenario.feeders, scenario.substations);
  renderSummary(scenario);
  renderEvents(scenario);
  updateClock();
  wireEquipmentClicks(scenario);
  if (appState.selectedEquipment) showDetail(appState.selectedEquipment, scenario);
  requestAnimationFrame(() => drawWires(scenario));
}

function renderSubstations(list) {
  const row = document.getElementById("substationRow");
  row.innerHTML = list.map((substation) => `
    <article class="substation-card equipment-card ${substation.id}" data-equipment="${substation.id}" tabindex="0">
      <div class="drop-line ${substation.transformers.some((item) => item.quality === "STALE") ? "stale" : substation.transformers.some((item) => item.energized) ? "energized" : "off"}"></div>
      <h2>${substation.name}</h2>
      <p>S/S</p>
      <div class="transformer-stack ${substation.transformers.length > 1 ? "multi" : ""}">
        ${substation.transformers.length > 1 ? substation.transformers.map((transformer, index) =>
          `<span class="branch-line ${index === 0 ? "left" : "right"} ${statusClass(transformer)}" aria-hidden="true"></span>`
        ).join("") : ""}
        ${substation.transformers.map((transformer) => renderTransformer(substation, transformer)).join("")}
      </div>
    </article>
  `).join("");
}

function renderTransformer(substation, transformer) {
  const state = statusClass(transformer);
  const featured = appState.activeEvent === "t1Energized" && transformer.id === "cat-t1" ? "featured" : "";
  const apparentLoad = transformer.pf ? transformer.load / transformer.pf : 0;
  const loadPercent = Math.round((apparentLoad / transformer.capacity) * 100);
  const staleMarkup = transformer.quality === "STALE"
    ? `<span class="stale-badge">STALE DATA | ${transformer.lastSeen}</span>`
    : "";

  return `
    <section class="transformer-card ${state} ${featured}" data-equipment="${transformer.id}" tabindex="0">
      <span class="wire-port input" data-port-type="transformer-input" data-port-id="${transformer.id}" title="Connect NGCP source"></span>
      <span class="wire-port output" data-port-type="transformer-output" data-port-id="${transformer.id}" title="Drag to a feeder"></span>
      <div class="transformer-line ${state}"></div>
      <span class="bay-breaker ${transformer.breaker === "CLOSED" ? "closed" : "open"}" aria-label="Breaker ${transformer.breaker}"></span>
      <div class="transformer-visual ${state}" aria-hidden="true">
        <span class="coil left"></span>
        <span class="coil right"></span>
        <span class="fan fan-a ${transformer.fan.toLowerCase()}"></span>
        <span class="fan fan-b ${transformer.fan.toLowerCase()}"></span>
      </div>
      <div class="transformer-copy">
        <strong class="transformer-nameplate"><span>${transformer.name}</span><b>${transformer.capacity} MVA</b></strong>
        <span class="breaker-copy">${transformer.breaker} | FAN ${transformer.fan === "RUNNING" ? "ON" : "OFF"}</span>
        <small>${transformer.load.toFixed(1)} MW / ${loadPercent}%</small>
        ${staleMarkup}
      </div>
    </section>
  `;
}

function renderFeeders(feeders, substations) {
  const grid = document.getElementById("feederGrid");
  const groups = substations.flatMap((substation) => substation.transformers.map((transformer) => {
    const assigned = feeders.filter((feeder) => feeder.transformerId === transformer.id);
    const count = Math.max(1, assigned.length);
    return `
      <section class="feeder-group" style="--feeder-count:${count};min-width:${count * 90}px" aria-label="${substation.name} ${transformer.name} feeder bus">
        <div class="section-bus ${statusClass(transformer)}" data-bus-for="${transformer.id}">
          <span class="bus-caption">${substation.code} ${transformer.name}</span>
          ${Array.from({ length: count }, () => '<i class="bus-segment" aria-hidden="true"></i>').join("")}
        </div>
        <div class="feeder-group-cards">
          ${assigned.length ? assigned.map(renderFeederCard).join("") : '<div class="empty-bay">NO FEEDERS</div>'}
        </div>
      </section>
    `;
  }));
  const unassigned = feeders.filter((feeder) => !feeder.transformerId);
  if (unassigned.length) {
    groups.push(`
      <section class="feeder-group unassigned" style="--feeder-count:${unassigned.length};min-width:${unassigned.length * 90}px" aria-label="Unassigned feeders">
        <div class="section-bus off">
          <span class="bus-caption">UNASSIGNED</span>
          ${Array.from({ length: unassigned.length }, () => '<i class="bus-segment" aria-hidden="true"></i>').join("")}
        </div>
        <div class="feeder-group-cards">${unassigned.map(renderFeederCard).join("")}</div>
      </section>
    `);
  }
  grid.innerHTML = groups.join("");
}

function renderFeederCard(feeder) {
    const state = statusClass(feeder);
    const upstreamState = feeder.breaker === "TRIPPED"
      ? "trip"
      : feeder.breaker === "OPEN" ? "off" : state;
    const featured = appState.activeEvent === "t1Energized" && feeder.transformerId === "cat-t1" ? "featured" : "";
    const loadPercent = Math.min(99, Math.round((feeder.mw / 2.9) * 100));
    const tieClosed = appState.wiring.tie?.sourceId === feeder.id || appState.wiring.tie?.targetId === feeder.id;
    const statusLabel = feeder.comm === "COMM LOST"
      ? "communication lost, last known state shown"
      : feeder.breaker === "TRIPPED"
        ? "breaker tripped"
        : feeder.energized
          ? feeder.tieFrom ? `energized via ${feeder.tieFrom.replace("-", " ")} tie` : "energized"
          : "no power";
    return `
      <article class="feeder-card ${state} ${featured}" data-equipment="${feeder.id}" tabindex="0" aria-label="${feeder.name}: ${statusLabel}" title="${feeder.name}: ${statusLabel}">
        <span class="wire-port input" data-port-type="feeder-input" data-port-id="${feeder.id}" title="Connect from a transformer"></span>
        <div class="feeder-drop ${upstreamState}"></div>
        <span class="feeder-breaker ${feeder.breaker === "CLOSED" ? "closed" : feeder.breaker === "TRIPPED" ? "trip" : "open"}" aria-label="Upstream breaker ${feeder.breaker}"></span>
        <div class="feeder-head">
          <strong>${feeder.name}</strong>
          <button class="tie-switch ${tieClosed ? "closed" : ""}" type="button" data-tie-feeder="${feeder.id}" aria-label="Draft tie switch for ${feeder.name}" aria-pressed="${tieClosed}" title="${tieClosed ? "Draft tie simulated closed - manage" : "Set draft feeder tie"}">⇄</button>
        </div>
        <dl>
          <div><dt>V</dt><dd>${feeder.voltage.toFixed(2)} kV</dd></div>
          <div><dt>I</dt><dd>${Math.round(feeder.current)} A</dd></div>
          <div><dt>P</dt><dd>${feeder.mw.toFixed(2)} MW</dd></div>
          <div><dt>PF</dt><dd>${feeder.pf.toFixed(2)}</dd></div>
        </dl>
        <div class="load-bar"><span style="width:${loadPercent}%"></span></div>
        <small>${feeder.comm === "COMM LOST" ? "COMM LOST / STALE" : feeder.tieFrom ? `FED BY ${feeder.tieFrom.replace("-", " ").toUpperCase()}` : feeder.transformerId ? `${feeder.substation} ${feeder.transformerName}` : "NO TRANSFORMER"}</small>
      </article>
    `;
}

function renderSummary(scenario) {
  const allTransformers = scenario.substations.flatMap((substation) => substation.transformers);
  const totalLoad = allTransformers.reduce((sum, transformer) => sum + transformer.load, 0);
  const totalCurrent = scenario.feeders.reduce((sum, feeder) => sum + feeder.current, 0);

  document.getElementById("totalsTitle").textContent = appState.activeEvent === "commLost"
    ? "System Totals | Includes Stale Data"
    : "System Totals";

  document.getElementById("totalLoad").textContent = `${totalLoad.toFixed(2)} MW`;
  document.getElementById("totalCurrent").textContent = `${Math.round(totalCurrent).toLocaleString()} A`;
  document.getElementById("systemVoltage").textContent = `${average(scenario.feeders.filter((f) => f.voltage > 0).map((f) => f.voltage)).toFixed(2)} kV`;
  document.getElementById("systemFrequency").textContent = "59.99 Hz";
  document.getElementById("ngcpPower").textContent = `${totalLoad.toFixed(1)} MW`;

  document.getElementById("substationSummary").innerHTML = scenario.substations.map((substation) => {
    const load = substation.transformers.reduce((sum, transformer) => sum + transformer.load, 0);
    const online = substation.transformers.filter((transformer) => transformer.energized).length;
    const stale = substation.transformers.some((transformer) => transformer.comm === "COMM LOST");
    return `
      <tr>
        <td>${substation.name}</td>
        <td>${load.toFixed(1)} MW</td>
        <td>${online}/${substation.transformers.length}</td>
        <td><span class="status-pill ${stale ? "stale" : online ? "energized" : "off"}">${stale ? "STALE" : online ? "NORMAL" : "OFF"}</span></td>
      </tr>
    `;
  }).join("");
}

function renderEvents(scenario) {
  const events = [
    { time: "13:38:42", type: "NORMAL", text: "NGCP source normal", value: "69.1 kV" },
    { time: "13:35:10", type: "EVENT", text: "Dashboard demo mode active", value: appState.activeEvent.toUpperCase() },
  ];

  if (appState.activeEvent === "t2Off") {
    events.unshift({ time: "13:37:22", type: "EVENT", text: "Catbalogan T2 breaker open", value: "Transformer off" });
  }
  if (appState.activeEvent === "feederTrip") {
    events.unshift({ time: "13:37:49", type: "ALARM", text: "Feeder 10 trip", value: "Downstream de-energized" });
  }
  if (appState.activeEvent === "commLost") {
    events.unshift({ time: "13:36:24", type: "WARNING", text: "Villareal telemetry stale", value: "Last known state retained" });
  }
  if (appState.wiring.tie) {
    const { sourceId, targetId } = appState.wiring.tie;
    events.unshift({ time: "ACTIVE", type: "EVENT", text: `${sourceId.replace("-", " ").toUpperCase()} to ${targetId.replace("-", " ").toUpperCase()} tie simulated closed`, value: "Draft transfer" });
  }
  events.unshift(...appState.audit.map((entry) => ({ time: entry.time, type: "EVENT", text: entry.text, value: "Simulation" })));

  document.getElementById("eventLog").innerHTML = events
    .filter((event) => appState.eventFilter === "ALL" || event.type === appState.eventFilter)
    .slice(0, 8)
    .map((event) => `
    <li class="${event.type.toLowerCase()}">
      <span>${escapeHtml(event.time)}</span>
      <strong>${escapeHtml(event.text)}</strong>
      <em>${escapeHtml(event.value)}</em>
    </li>
  `).join("");
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function updateClock() {
  const now = new Date();
  document.getElementById("dateText").textContent = now.toLocaleDateString("en-SG", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase();
  document.getElementById("timeText").textContent = now.toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function wireEquipmentClicks(scenario) {
  document.querySelectorAll("[data-equipment]").forEach((element) => {
    if (element.dataset.bound === "true") return;
    element.dataset.bound = "true";
    element.addEventListener("click", (event) => {
      if (event.target.closest(".wire-port, .panel-toggle")) return;
      event.stopPropagation();
      showDetail(element.dataset.equipment, scenario);
    });
    element.addEventListener("keydown", (event) => {
      if (event.target.closest(".tie-switch, .panel-toggle")) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        showDetail(element.dataset.equipment, scenario);
      }
    });
  });
}

function pointInDiagram(element, panel) {
  const rect = element.getBoundingClientRect();
  const bounds = panel.getBoundingClientRect();
  return {
    x: rect.left - bounds.left + panel.scrollLeft + rect.width / 2,
    y: rect.top - bounds.top + panel.scrollTop + rect.height / 2,
  };
}

function bottomPointInDiagram(element, panel) {
  const point = pointInDiagram(element, panel);
  const rect = element.getBoundingClientRect();
  const bounds = panel.getBoundingClientRect();
  return { x: point.x, y: rect.bottom - bounds.top + panel.scrollTop };
}

function fitBusEndpoints(panel) {
  const powerBus = document.querySelector(".power-bus");
  const drops = [...document.querySelectorAll(".substation-card > .drop-line")];
  if (powerBus && drops.length) {
    powerBus.style.left = "0px";
    powerBus.style.width = "";
    const busStart = pointInDiagram(powerBus, panel).x - powerBus.getBoundingClientRect().width / 2;
    const centers = drops.map((drop) => pointInDiagram(drop, panel).x);
    const first = centers[0];
    const last = centers[centers.length - 1];
    powerBus.style.left = `${first - busStart}px`;
    powerBus.style.width = `${last - first}px`;
    powerBus.querySelectorAll("i").forEach((node, index) => {
      node.style.left = `${centers[index] - first - node.getBoundingClientRect().width / 2}px`;
    });
    for (const sourceElement of [document.querySelector(".ngcp-node"), document.querySelector(".vertical-drop")]) {
      if (!sourceElement) continue;
      sourceElement.style.left = "0px";
      const sourceX = pointInDiagram(sourceElement, panel).x;
      sourceElement.style.left = `${(first + last) / 2 - sourceX}px`;
    }
  }

}

function drawWires(scenario) {
  const panel = document.querySelector(".diagram-panel");
  fitBusEndpoints(panel);
  const svg = document.getElementById("wiringLayer");
  svg.style.width = "0px";
  svg.style.height = "0px";
  const width = panel.scrollWidth;
  const height = panel.scrollHeight;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  const paths = [];

  scenario.substations.flatMap((substation) => substation.transformers).forEach((transformer) => {
    const outputPort = document.querySelector(`[data-port-type="transformer-output"][data-port-id="${transformer.id}"]`);
    const bus = document.querySelector(`[data-bus-for="${transformer.id}"]`);
    if (!outputPort || !bus) return;
    const from = pointInDiagram(outputPort, panel);
    const to = pointInDiagram(bus, panel);
    const bendY = from.y + Math.max(12, (to.y - from.y) / 2);
    const route = `M ${from.x} ${from.y} V ${bendY} H ${to.x} V ${to.y}`;
    const state = statusClass(transformer);
    paths.push(`<path class="wire-path trunk ${state}" d="${route}"/>`);
    if (state === "energized") {
      paths.push(`<path class="wire-pulse" pathLength="100" d="${route}"/>`);
    }
  });

  if (appState.wiring.tie) {
    const { sourceId, targetId } = appState.wiring.tie;
    const sourceCard = document.querySelector(`[data-equipment="${sourceId}"]`);
    const targetCard = document.querySelector(`[data-equipment="${targetId}"]`);
    const source = scenario.feeders.find((feeder) => feeder.id === sourceId);
    const target = scenario.feeders.find((feeder) => feeder.id === targetId);
    if (sourceCard && targetCard && source && target) {
      const from = bottomPointInDiagram(sourceCard, panel);
      const to = bottomPointInDiagram(targetCard, panel);
      const laneY = Math.max(from.y, to.y) + 26;
      const route = `M ${from.x} ${from.y} V ${laneY} H ${to.x} V ${to.y}`;
      const state = source.quality === "STALE" || target.quality === "STALE"
        ? "stale"
        : target.energized ? "energized" : "off";
      paths.push(`<path class="wire-path tie ${state}" d="${route}"/>`);
      if (state === "energized") paths.push(`<path class="wire-pulse" pathLength="100" d="${route}"/>`);
      const switchX = (from.x + to.x) / 2;
      paths.push(`<rect class="tie-node ${state}" x="${switchX - 7}" y="${laneY - 7}" width="14" height="14" rx="2"/>`);
    }
  }

  if (appState.drag) {
    const from = pointInDiagram(appState.drag.port, panel);
    const to = appState.drag.to;
    paths.push(`<path class="wire-path pending" d="M ${from.x} ${from.y} L ${to.x} ${to.y}"/>`);
  }
  svg.innerHTML = paths.join("");
}

function applyWiringChange(change, description = "Draft wiring changed") {
  if (!appState.editWiring) return false;
  const previous = structuredClone(appState.wiring);
  change(appState.wiring);
  const errors = SCADATopology.validateWiring(substations, baseFeeders, appState.wiring);
  if (errors.length) {
    appState.wiring = previous;
    return false;
  }
  appState.activeEvent = "normal";
  appState.commLostAt = null;
  saveWiring();
  saveUIState();
  recordAudit(description);
  render();
  return true;
}

function setWiringMode(enabled) {
  appState.editWiring = enabled;
  appState.drag = null;
  if (enabled) {
    appState.activeEvent = "normal";
    appState.commLostAt = null;
  }
  saveUIState();
  render();
}

function selectDemoScenario(value) {
  if (!demoEvents.includes(value)) return false;
  appState.activeEvent = value;
  appState.commLostAt = value === "commLost" ? Date.now() - 138000 : null;
  appState.editWiring = false;
  appState.drag = null;
  saveUIState();
  return true;
}

document.addEventListener("pointerdown", (event) => {
  if (!appState.editWiring) return;
  const port = event.target.closest(".wire-port.output");
  if (!port) return;
  event.preventDefault();
  const panel = document.querySelector(".diagram-panel");
  appState.drag = { port, type: port.dataset.portType, id: port.dataset.portId, to: pointInDiagram(port, panel) };
  port.setPointerCapture(event.pointerId);
});

document.addEventListener("pointermove", (event) => {
  if (!appState.drag) return;
  const panel = document.querySelector(".diagram-panel");
  const bounds = panel.getBoundingClientRect();
  appState.drag.to = { x: event.clientX - bounds.left + panel.scrollLeft, y: event.clientY - bounds.top + panel.scrollTop };
  drawWires(getScenario());
});

document.addEventListener("pointerup", (event) => {
  if (!appState.drag) return;
  const drag = appState.drag;
  appState.drag = null;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const transformer = target?.closest(".transformer-card");
  const feeder = target?.closest(".feeder-card");
  if (drag.type === "source" && transformer) {
    applyWiringChange((wiring) => { wiring.sourceLinks[transformer.dataset.equipment] = true; }, `NGCP connected to ${transformer.dataset.equipment.toUpperCase()}`);
  } else if (drag.type === "transformer-output" && feeder) {
    applyWiringChange((wiring) => {
      wiring.feederLinks[feeder.dataset.equipment] = drag.id;
      if (wiring.tie && [wiring.tie.sourceId, wiring.tie.targetId].includes(feeder.dataset.equipment)) wiring.tie = null;
    }, `${feeder.dataset.equipment.toUpperCase()} mapped to ${drag.id.toUpperCase()}`);
  } else {
    drawWires(getScenario());
  }
});

document.getElementById("wiringToggle").addEventListener("click", () => {
  setWiringMode(!appState.editWiring);
});

function showDetail(id, scenario) {
  appState.selectedEquipment = id;
  const transformer = scenario.substations.flatMap((substation) =>
    substation.transformers.map((item) => ({ ...item, substation: substation.name }))
  ).find((item) => item.id === id);
  const feeder = scenario.feeders.find((item) => item.id === id);
  const substation = scenario.substations.find((item) => item.id === id);

  let item = transformer || feeder || substation || { name: "NGCP", status: "ENERGIZED" };
  let html = "";

  if (transformer) {
    html = `
      <span class="eyebrow">${transformer.substation} SUBSTATION</span>
      <h2>Transformer ${transformer.name}</h2>
      <p class="detail-status ${statusClass(transformer)}">${transformer.comm === "COMM LOST" ? "COMM LOST / STALE DATA" : transformer.energized ? "ENERGIZED" : "DE-ENERGIZED"}</p>
      <dl>
        <div><dt>Capacity</dt><dd>${transformer.capacity} MVA</dd></div>
        <div><dt>HV / LV</dt><dd>${transformer.hv.toFixed(2)} kV / ${transformer.lv.toFixed(2)} kV</dd></div>
        <div><dt>Load</dt><dd>${transformer.load.toFixed(1)} MW</dd></div>
        <div><dt>Current</dt><dd>${Math.round(transformer.current)} A</dd></div>
        <div><dt>Fan</dt><dd>${transformer.quality === "STALE" ? `LAST KNOWN ${transformer.fan}` : transformer.fan}</dd></div>
        <div><dt>Breaker</dt><dd>${transformer.breaker}</dd></div>
        <div><dt>Comm</dt><dd>${transformer.comm}</dd></div>
      </dl>
      ${transformer.quality === "STALE" ? '<p class="detail-note">Telemetry is stale. Electrical and fan states shown are last known values; current field state is unconfirmed.</p>' : ''}
      ${appState.editWiring ? `<div class="detail-actions">
        <button data-action="transformer-breaker" data-id="${transformer.id}">${transformer.breaker === "CLOSED" ? "Open breaker" : "Close breaker"}</button>
        <button data-action="source-link" data-id="${transformer.id}">${transformer.sourceConnected ? "Disconnect source" : "Connect source"}</button>
      </div>` : ""}
    `;
  } else if (feeder) {
    const tie = appState.wiring.tie;
    const tieParticipant = tie && [tie.sourceId, tie.targetId].includes(feeder.id);
    const tieOptions = scenario.feeders
      .filter((candidate) => candidate.id !== feeder.id)
      .map((candidate) => `<option value="${candidate.id}">${candidate.name} | ${candidate.substation} ${candidate.transformerName}</option>`)
      .join("");
    html = `
      <span class="eyebrow">${feeder.substation} | ${feeder.transformerName}</span>
      <h2>${feeder.name}</h2>
      <p class="detail-status ${statusClass(feeder)}">${feeder.comm === "COMM LOST" ? "COMM LOST / STALE DATA" : feeder.breaker === "TRIPPED" ? "TRIPPED" : feeder.tieFrom && feeder.energized ? "ENERGIZED VIA TIE" : !feeder.transformerId ? "UNASSIGNED" : feeder.energized ? "ENERGIZED" : feeder.breaker === "OPEN" ? "BREAKER OPEN" : "NO POWER"}</p>
      <dl>
        <div><dt>Voltage</dt><dd>${feeder.voltage.toFixed(2)} kV</dd></div>
        <div><dt>Current</dt><dd>${Math.round(feeder.current)} A</dd></div>
        <div><dt>MW / MVAR</dt><dd>${feeder.mw.toFixed(2)} / ${feeder.mvar.toFixed(2)}</dd></div>
        <div><dt>Power Factor</dt><dd>${feeder.pf.toFixed(2)}</dd></div>
        <div><dt>Breaker</dt><dd>${feeder.breaker}</dd></div>
        <div><dt>Supply</dt><dd>${feeder.tieFrom ? `TIE FROM ${feeder.tieFrom.replace("-", " ").toUpperCase()}` : `${feeder.substation} ${feeder.transformerName}`}</dd></div>
        <div><dt>Comm</dt><dd>${feeder.comm}</dd></div>
      </dl>
      <section class="tie-control">
        <h3>Feeder tie switch</h3>
        ${!appState.editWiring
          ? `<p>${tieParticipant ? "SIMULATED CLOSED | DRAFT TRANSFER" : "OPEN"} | Read-only demo. Enter Simulation Edit to change connections.</p>`
          : tieParticipant
          ? `<p>${tie.sourceId.replace("-", " ").toUpperCase()} to ${tie.targetId.replace("-", " ").toUpperCase()} | SIMULATED CLOSED</p>
             <button data-action="open-tie" data-id="${feeder.id}">Simulate opening tie</button>`
          : tie
            ? `<p>One tie is closed. Open it before making another transfer.</p>`
            : `<label for="tieTarget">Connect to feeder</label>
               <select id="tieTarget">${tieOptions}</select>
               <p class="tie-preview" id="tiePreview" aria-live="polite"></p>
               <button data-action="close-tie" data-id="${feeder.id}">Simulate transfer</button>
               <p class="tie-note">Draft only. Opens destination upstream breaker before closing tie. Physical tie route and protection are unverified; no field commands.</p>`}
        <p class="tie-error" id="tieError" role="alert"></p>
      </section>
      ${appState.editWiring ? `<div class="detail-actions">
        <button data-action="feeder-breaker" data-id="${feeder.id}">${feeder.breaker === "CLOSED" ? "Open breaker" : "Close breaker"}</button>
        <button data-action="disconnect-feeder" data-id="${feeder.id}" ${feeder.transformerId ? "" : "disabled"}>Disconnect feeder</button>
      </div>` : ""}
    `;
  } else if (substation) {
    const stale = substation.transformers.some((item) => item.quality === "STALE");
    html = `
      <span class="eyebrow">SUBSTATION</span>
      <h2>${substation.name} S/S</h2>
      <p class="detail-status ${stale ? "stale" : "energized"}">${stale ? "COMM LOST / STALE DATA" : `${substation.transformers.length} transformer bay(s)`}</p>
      <p class="detail-note">Initial feeder mapping is configured in topology.js and must be checked against the approved SAMELCO II one-line.</p>
    `;
  } else {
    html = `
      <span class="eyebrow">GRID SOURCE</span>
      <h2>${item.name}</h2>
      <p class="detail-status energized">ENERGIZED</p>
      <p class="detail-note">Incoming source telemetry is shown as read-only monitoring data.</p>
    `;
  }

  document.getElementById("detailContent").innerHTML = html;
  document.getElementById("detailPanel").classList.add("open");
  const tieTarget = document.getElementById("tieTarget");
  if (tieTarget) {
    const updatePreview = () => {
      const current = getScenario();
      const nominal = baseFeeders.find((item) => item.id === tieTarget.value);
      const preview = SCADATopology.previewTransfer(current, appState.wiring, feeder.id, tieTarget.value, nominal);
      const copy = preview.ok
        ? `Eligible for draft simulation. Source projected ${preview.projectedMVA.toFixed(1)} / ${preview.ratingMVA} MVA after transfer.`
        : preview.reasons.join(" ");
      document.getElementById("tiePreview").textContent = copy;
      document.getElementById("tiePreview").className = `tie-preview ${preview.ok ? "ready" : "blocked"}`;
      document.querySelector('[data-action="close-tie"]').disabled = !preview.ok;
    };
    tieTarget.addEventListener("change", updatePreview);
    updatePreview();
  }
  document.querySelectorAll("#detailContent [data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      if (button.dataset.action === "close-tie") {
        if (!appState.editWiring) return;
        const targetId = document.getElementById("tieTarget").value;
        const current = getScenario();
        const nominal = baseFeeders.find((item) => item.id === targetId);
        const preview = SCADATopology.previewTransfer(current, appState.wiring, id, targetId, nominal);
        if (!preview.ok) {
          document.getElementById("tieError").textContent = preview.reasons.join(" ");
          return;
        }
        applyWiringChange((wiring) => {
          wiring.feederBreakers[targetId] = "OPEN";
          wiring.tie = { sourceId: id, targetId };
        }, `${id.toUpperCase()} to ${targetId.toUpperCase()} tie simulated closed`);
        return;
      }
      if (button.dataset.action === "open-tie") {
        applyWiringChange((wiring) => { wiring.tie = null; }, `${id.toUpperCase()} tie simulated open`);
        return;
      }
      applyWiringChange((wiring) => {
        if (button.dataset.action === "transformer-breaker") wiring.transformerBreakers[id] = wiring.transformerBreakers[id] === "CLOSED" ? "OPEN" : "CLOSED";
        if (button.dataset.action === "source-link") wiring.sourceLinks[id] = !wiring.sourceLinks[id];
        if (button.dataset.action === "feeder-breaker") {
          const closing = wiring.feederBreakers[id] !== "CLOSED";
          if (closing && wiring.tie?.targetId === id) wiring.tie = null;
          wiring.feederBreakers[id] = closing ? "CLOSED" : "OPEN";
        }
        if (button.dataset.action === "disconnect-feeder") {
          wiring.feederLinks[id] = null;
          if (wiring.tie && [wiring.tie.sourceId, wiring.tie.targetId].includes(id)) wiring.tie = null;
        }
      }, `${id.toUpperCase()} ${button.textContent.toLowerCase()} simulated`);
    });
  });
}

document.getElementById("closePanel").addEventListener("click", () => {
  appState.selectedEquipment = null;
  document.getElementById("detailPanel").classList.remove("open");
});

document.getElementById("sourceToggle").addEventListener("click", (event) => {
  event.stopPropagation();
  appState.ui.sourceCollapsed = !appState.ui.sourceCollapsed;
  saveUIState();
  render();
});

document.getElementById("bottomToggle").addEventListener("click", () => {
  appState.ui.bottomCollapsed = !appState.ui.bottomCollapsed;
  saveUIState();
  render();
});

document.getElementById("demoScenario").addEventListener("change", (event) => {
  if (selectDemoScenario(event.target.value)) render();
});

document.querySelectorAll(".event-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".event-tabs button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    appState.eventFilter = button.dataset.filter;
    saveUIState();
    renderEvents(getScenario());
  });
});

setInterval(() => {
  if (appState.drag) return;
  if (document.activeElement?.closest?.(".tie-control")) {
    updateClock();
    return;
  }
  if (appState.activeEvent === "normal") {
    baseFeeders.forEach((feeder, index) => {
      const wave = Math.sin(Date.now() / 2500 + index) * 0.02;
      feeder.voltage = Math.max(0, feeder.voltage + wave);
      feeder.mw = Math.max(0, feeder.mw + wave * 0.2);
      feeder.current = feeder.mw * 1000 / (Math.sqrt(3) * feeder.voltage * feeder.pf);
      feeder.mvar = feeder.mw * Math.tan(Math.acos(feeder.pf));
    });
  }
  render();
}, 5000);

window.addEventListener("resize", () => drawWires(getScenario()));

render();
