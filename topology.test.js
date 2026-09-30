const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function dashboard(initialStorage = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const context = vm.createContext({
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    structuredClone,
    Date,
    Math,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "topology.js"), "utf8"), context);
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  vm.runInContext(app.split('document.addEventListener("pointerdown"')[0], context);
  vm.runInContext(app.slice(app.indexOf("function showDetail("), app.indexOf('document.getElementById("closePanel")')), context);
  const run = (expression) => vm.runInContext(expression, context);
  run.storage = storage;
  return run;
}

test("draft mapping yields five isolated transformer bus sections", () => {
  const run = dashboard();
  assert.equal(run("getScenario().feeders.length"), 15);
  assert.equal(run("getScenario().topology.edges.filter(edge => edge.to.startsWith('bus:')).length"), 5);
  assert.equal(run("getScenario().feeders[0].energized"), true);
  assert.equal(run("getScenario().feeders[4].energized"), false);
  assert.equal(run("getScenario().topology.errors.length"), 0);
  assert.ok(Math.abs(run("getScenario().substations.flatMap(s => s.transformers).reduce((sum, t) => sum + t.load, 0) - getScenario().feeders.reduce((sum, f) => sum + f.mw, 0)")) < 0.001);
});

test("tie powers only the isolated destination and follows source loss", () => {
  const run = dashboard();
  run('appState.wiring.tie = { sourceId: "feeder-1", targetId: "feeder-5" }');
  assert.equal(run('getScenario().feeders[4].breaker'), "OPEN");
  assert.equal(run('getScenario().feeders[4].energized'), true);
  assert.equal(run('getScenario().feeders[4].tieFrom'), "feeder-1");
  assert.ok(run('getScenario().substations[0].transformers[0].load') > 8);
  assert.ok(Math.abs(run("getScenario().substations.flatMap(s => s.transformers).reduce((sum, t) => sum + t.load, 0) - getScenario().feeders.reduce((sum, f) => sum + f.mw, 0)")) < 0.001);
  run('appState.wiring.sourceLinks["cat-t1"] = false');
  assert.equal(run('getScenario().feeders[4].energized'), false);
});

test("closed destination upstream breaker is rejected", () => {
  const run = dashboard();
  run('appState.wiring.tie = { sourceId: "feeder-1", targetId: "feeder-2" }');
  assert.equal(run('getScenario().topology.errors.length'), 1);
  assert.equal(run('getScenario().feeders[1].energized'), false);
});

test("tripped destination does not energize through a tie", () => {
  const run = dashboard();
  run('appState.wiring.tie = { sourceId: "feeder-1", targetId: "feeder-10" }; appState.wiring.feederBreakers["feeder-10"] = "OPEN"; appState.activeEvent = "feederTrip"');
  assert.equal(run('getScenario().topology.errors.length'), 0);
  assert.equal(run('getScenario().feeders[9].energized'), false);
});

test("COMM LOST keeps last-known power amber across the tie", () => {
  const run = dashboard();
  run('appState.wiring.tie = { sourceId: "feeder-10", targetId: "feeder-5" }; appState.activeEvent = "commLost"');
  assert.equal(run('getScenario().feeders[4].energized'), true);
  assert.equal(run('getScenario().feeders[4].quality'), "STALE");
  assert.equal(run('statusClass(getScenario().feeders[4])'), "stale");
});

test("transfer preview blocks overload and permits an in-rating draft", () => {
  const run = dashboard();
  assert.equal(run('SCADATopology.previewTransfer(getScenario(), appState.wiring, "feeder-1", "feeder-5", baseFeeders[4]).ok'), true);
  assert.equal(run('SCADATopology.previewTransfer(getScenario(), appState.wiring, "feeder-13", "feeder-1", baseFeeders[0]).ok'), false);
  assert.equal(run('SCADATopology.previewTransfer(getScenario(), appState.wiring, "feeder-13", "feeder-15", baseFeeders[14]).ok'), true);
  run('appState.activeEvent = "commLost"');
  assert.equal(run('SCADATopology.previewTransfer(getScenario(), appState.wiring, "feeder-10", "feeder-5", baseFeeders[4]).ok'), false);
});

test("read-only mode rejects wiring mutation", () => {
  const run = dashboard();
  assert.equal(run('applyWiringChange(wiring => { wiring.sourceLinks["cat-t1"] = false; })'), false);
  assert.equal(run('appState.wiring.sourceLinks["cat-t1"]'), true);
});

test("monitoring detail has no switch command until Simulation Edit", () => {
  const run = dashboard();
  run("globalThis.document = { getElementById: (id) => id === 'detailContent' ? globalThis.detailContent : id === 'detailPanel' ? globalThis.detailPanel : null, querySelectorAll: () => [] }");
  run("globalThis.detailContent = { innerHTML: '' }; globalThis.detailPanel = { classList: { add() {} } }");
  run('showDetail("feeder-1", getScenario())');
  assert.match(run("detailContent.innerHTML"), /Read-only demo/);
  assert.doesNotMatch(run("detailContent.innerHTML"), /data-action="close-tie"/);
  run("appState.editWiring = true");
  run('showDetail("feeder-1", getScenario())');
  assert.match(run("detailContent.innerHTML"), /data-action="close-tie"/);
});

test("each feeder bus is segmented to its actual feeder columns", () => {
  const run = dashboard();
  run("globalThis.grid = { innerHTML: '' }; globalThis.document = { getElementById: () => globalThis.grid }");
  run("renderFeeders(getScenario().feeders, getScenario().substations)");
  const markup = run("grid.innerHTML");
  assert.equal((markup.match(/class="section-bus /g) || []).length, 5);
  assert.equal((markup.match(/class="bus-segment"/g) || []).length, 15);
  const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  assert.match(css, /\.bus-segment:first-of-type::before\s*\{\s*left: 50%/);
  assert.match(css, /\.bus-segment:last-of-type::before\s*\{\s*right: 50%/);
  assert.doesNotMatch(css, /\.section-bus\.energized\s*\{\s*background:/);
});

test("panel choices and demo preferences restore, but edit mode stays off", () => {
  const first = dashboard();
  first('appState.ui.sourceCollapsed = true; appState.ui.bottomCollapsed = true; appState.activeEvent = "feederTrip"; appState.eventFilter = "ALARM"; saveUIState()');
  const saved = first.storage.get("samelco-scada-ui-v1");
  const restored = dashboard({ "samelco-scada-ui-v1": saved });
  assert.equal(restored("appState.ui.sourceCollapsed"), true);
  assert.equal(restored("appState.ui.bottomCollapsed"), true);
  assert.equal(restored("appState.activeEvent"), "feederTrip");
  assert.equal(restored("appState.eventFilter"), "ALARM");
  assert.equal(restored("appState.editWiring"), false);
});

test("draft wiring remains saved across reload", () => {
  const first = dashboard();
  first('appState.wiring.feederLinks["feeder-5"] = "cat-t1"; saveWiring()');
  const saved = first.storage.get("samelco-scada-draft-wiring-v1");
  const restored = dashboard({ "samelco-scada-draft-wiring-v1": saved });
  assert.equal(restored('appState.wiring.feederLinks["feeder-5"]'), "cat-t1");
});

test("scenario dropdown saves only valid demo selections", () => {
  const run = dashboard();
  run("appState.editWiring = true; appState.ui.bottomCollapsed = true");
  assert.equal(run('selectDemoScenario("feederTrip")'), true);
  assert.equal(run("appState.activeEvent"), "feederTrip");
  assert.equal(run("appState.editWiring"), false);
  assert.equal(run("appState.ui.bottomCollapsed"), true);
  assert.equal(run('selectDemoScenario("not-a-scenario")'), false);
  assert.equal(run("appState.activeEvent"), "feederTrip");
  assert.equal(JSON.parse(run.storage.get("samelco-scada-ui-v1")).activeEvent, "feederTrip");
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /<select id="demoScenario"/);
  assert.equal((html.match(/<option value=/g) || []).length, 5);
  assert.doesNotMatch(html, /data-event=/);
});

test("transformer MVA cards stay portrait while Catbalogan bays remain side by side", () => {
  const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  assert.match(css, /\.transformer-stack\.multi\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.transformer-card\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);
  assert.match(css, /\.transformer-nameplate\s*\{[^}]*flex-direction:\s*column;/);
  assert.match(css, /\.transformer-card\s*\{[^}]*background:\s*transparent;/);
  assert.doesNotMatch(css, /\.transformer-card\.(?:energized|off|stale)\s*\{[^}]*background:/);
});

test("visual power effects follow energized state and respect reduced motion", () => {
  const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  assert.match(css, /\.transformer-visual\.energized\s*\{[^}]*animation:/);
  assert.match(css, /\.feeder-card\.energized::before\s*\{[^}]*animation:/);
  assert.match(css, /\.stale \.fan\.running\s*\{[^}]*animation:\s*none;/);
  assert.match(css, /\.feeder-card\.stale \.load-bar span\s*\{[^}]*background:\s*var\(--amber\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.transformer-visual\.energized[^}]*animation:\s*none;/);
});

test("transformer drops run vertically into their bus and end at its edge when offset", () => {
  const run = dashboard();
  assert.equal(run("routeTransformerDrop({ x: 50, y: 10 }, 100, 20, 80)"), "M 50 10 V 100");
  assert.equal(run("routeTransformerDrop({ x: 10, y: 10 }, 100, 20, 80)"), "M 10 10 V 100 H 20");
  assert.equal(run("routeTransformerDrop({ x: 90, y: 10 }, 100, 20, 80)"), "M 90 10 V 100 H 80");
});

test("transformer readouts show measurements and flag stale values", () => {
  const run = dashboard();
  const normal = run("renderTransformer(getScenario().substations[0], getScenario().substations[0].transformers[0])");
  assert.match(normal, /class="transformer-readout"/);
  for (const label of ["HV", "LV", "P", "I", "PF", "TEMP"]) assert.match(normal, new RegExp(`<dt>${label}</dt>`));
  assert.doesNotMatch(normal, /LAST KNOWN/);
  run('appState.activeEvent = "commLost"');
  const stale = run("renderTransformer(getScenario().substations[2], getScenario().substations[2].transformers[0])");
  assert.match(stale, /LAST KNOWN/);
  const css = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  assert.match(css, /\.transformer-readout\s*\{[^}]*right:\s*calc\(50% \+ 44px\)/);
  assert.match(css, /\.substation-row\s*\{[^}]*padding-left:\s*48px/);
  assert.match(css, /\.section-bus \.bus-caption\s*\{[^}]*background:\s*transparent;[^}]*text-shadow:/);
});
