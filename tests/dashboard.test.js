const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function dashboard(initialStorage = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const context = vm.createContext({
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    structuredClone,
    Date,
    Math,
  });
  vm.runInContext(read("src/js/topology.js"), context);
  const app = read("src/js/app.js");
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
  const css = read("src/css/styles.css");
  assert.match(css, /\.bus-segment:first-of-type::before\s*\{\s*left: 50%/);
  assert.match(css, /\.bus-segment:last-of-type::before\s*\{\s*right: 50%/);
  assert.doesNotMatch(css, /\.section-bus\.energized\s*\{\s*background:/);
});

test("panel choices and demo preferences restore, but edit mode stays off", () => {
  const first = dashboard();
  first('appState.ui.sourceCollapsed = true; appState.ui.bottomCollapsed = true; appState.ui.sourceFace = "logs"; appState.activeEvent = "feederTrip"; appState.eventFilter = "ALARM"; saveUIState()');
  const saved = first.storage.get("samelco-scada-ui-v1");
  const restored = dashboard({ "samelco-scada-ui-v1": saved });
  assert.equal(restored("appState.ui.sourceCollapsed"), true);
  assert.equal(restored("appState.ui.bottomCollapsed"), true);
  assert.equal(restored("appState.ui.sourceFace"), "logs");
  assert.equal(restored("appState.activeEvent"), "feederTrip");
  assert.equal(restored("appState.eventFilter"), "ALARM");
  assert.equal(restored("appState.editWiring"), false);
});

test("simulated sidebar logs stay newest first and mark stale data", () => {
  const run = dashboard();
  run('pushLiveLog("SAMPLE", "first", "demo"); pushLiveLog("ACTION", "second", "demo")');
  assert.equal(run("appState.liveLog[0].text"), "second");
  run("globalThis.logList = { innerHTML: '', scrollTop: 10 }; globalThis.logCount = { textContent: '' }; globalThis.document = { getElementById: (id) => id === 'sideLogList' ? logList : logCount }");
  run("renderLiveLogs()");
  const markup = run("logList.innerHTML");
  assert.ok(markup.indexOf("second") < markup.indexOf("first"));
  assert.equal(run("logList.scrollTop"), 0);
  run('selectDemoScenario("commLost"); sampleLiveLog(getScenario())');
  assert.equal(run("appState.liveLog[0].type"), "WARNING");
  assert.match(run("appState.liveLog[0].detail"), /current field state unconfirmed/);
  run('for (let index = 0; index < 40; index++) pushLiveLog("SAMPLE", String(index), "demo")');
  assert.equal(run("appState.liveLog.length"), 30);
  const html = read("index.html");
  assert.match(html, /id="sourceFlip"/);
  assert.match(html, /id="sourceLogFace"[^>]*hidden/);
  assert.match(html, /SIMULATED LIVE/);
  const css = read("src/css/styles.css");
  assert.doesNotMatch(css, /\.source-panel\s*\{[^}]*border-left:/);
  assert.match(css, /\.source-panel\.source-flipping \.source-face:not\(\[hidden\]\), \.side-log-list li\.fresh, \.live-dot \{ animation: none; \}/);
});

test("sidebar flips between NGCP meters and logs", () => {
  const run = dashboard();
  run(`
    globalThis.rail = { textContent: "" };
    globalThis.panel = { tabIndex: 0, classList: { toggle(name, active) { this[name] = active; } }, querySelector: () => rail };
    globalThis.elements = {
      sourceContent: { hidden: false }, sourceLogFace: { hidden: true },
      sourceTitle: { textContent: "" }, sourceSubtitle: { textContent: "" },
      sourceFlip: { attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, getAttribute(name) { return this.attrs[name]; } },
    };
    globalThis.document = { querySelector: () => panel, getElementById: (id) => elements[id] };
    appState.ui.sourceFace = "logs";
    renderSourceFace();
  `);
  assert.equal(run("panel.classList['logs-active']"), true);
  assert.equal(run("elements.sourceContent.hidden"), true);
  assert.equal(run("elements.sourceLogFace.hidden"), false);
  assert.equal(run("elements.sourceTitle.textContent"), "LOGS");
  assert.equal(run("elements.sourceFlip.attrs['aria-pressed']"), "true");
  assert.equal(run("panel.tabIndex"), -1);
  run('appState.ui.sourceFace = "meters"; renderSourceFace()');
  assert.equal(run("elements.sourceContent.hidden"), false);
  assert.equal(run("elements.sourceLogFace.hidden"), true);
  assert.equal(run("elements.sourceTitle.textContent"), "NGCP");
  assert.equal(run("elements.sourceFlip.attrs['aria-pressed']"), "false");
  assert.equal(run("panel.tabIndex"), 0);
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
  const html = read("index.html");
  assert.match(html, /<select id="demoScenario"/);
  assert.equal((html.match(/<select id="demoScenario"[^]*?<\/select>/)[0].match(/<option value=/g) || []).length, 5);
  assert.doesNotMatch(html, /data-event=/);
});

test("transformer MVA cards stay portrait while Catbalogan bays remain side by side", () => {
  const css = read("src/css/styles.css");
  assert.match(css, /\.transformer-stack\.multi\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.transformer-card\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);
  assert.match(css, /\.transformer-nameplate\s*\{[^}]*flex-direction:\s*column;/);
  assert.match(css, /\.transformer-card\s*\{[^}]*background:\s*transparent;/);
  assert.doesNotMatch(css, /\.transformer-card\.(?:energized|off|stale)\s*\{[^}]*background:/);
});

test("visual power effects follow energized state and respect reduced motion", () => {
  const css = read("src/css/styles.css");
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
  assert.match(normal, /<div class="transformer-visual[^"]*">\s*<span class="wire-port output" data-port-type="transformer-output"/);
  for (const label of ["HV", "LV", "P", "I", "PF", "TEMP"]) assert.match(normal, new RegExp(`<dt>${label}</dt>`));
  assert.doesNotMatch(normal, /LAST KNOWN/);
  run('appState.activeEvent = "commLost"');
  const stale = run("renderTransformer(getScenario().substations[2], getScenario().substations[2].transformers[0])");
  assert.match(stale, /LAST KNOWN/);
  const css = read("src/css/styles.css");
  assert.match(css, /\.transformer-visual > \.wire-port\.output\s*\{\s*bottom:\s*-7px/);
  assert.match(css, /\.transformer-readout\s*\{[^}]*right:\s*calc\(50% \+ 44px\)/);
  assert.match(css, /\.substation-row\s*\{[^}]*padding-left:\s*48px/);
  assert.match(css, /\.section-bus \.bus-caption\s*\{[^}]*background:\s*transparent;[^}]*text-shadow:/);
  assert.match(css, /\.transformer-copy\s*\{[^}]*text-shadow:\s*var\(--wire-label-shadow\)/);
});

test("legend stays borderless at the bottom of the feeder diagram", () => {
  const html = read("index.html");
  const css = read("src/css/styles.css");
  const feederAt = html.indexOf('id="feederGrid"');
  const legendAt = html.indexOf('class="diagram-legend"');
  const wiringAt = html.indexOf('id="wiringLayer"');
  const bottomAt = html.indexOf('id="bottomGrid"');
  assert.ok(feederAt < legendAt && legendAt < wiringAt && wiringAt < bottomAt);
  assert.doesNotMatch(html, /<h2>Legend<\/h2>/);
  assert.match(html, /class="diagram-legend" aria-label="Legend"/);
  assert.doesNotMatch(html, /class="legend-panel"/);
  assert.match(css, /\.diagram-legend\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/);
  assert.match(css, /\.legend-items\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.legend-items\s*\{[^}]*justify-content:\s*center;/);
});

test("control bar uses accessible icon-only controls", () => {
  const html = read("index.html");
  const css = read("src/css/styles.css");
  const app = read("src/js/app.js");
  assert.match(html, /id="wiringToggle"[^>]*aria-label="Enable simulation edit"[^>]*><img class="control-icon" src="\.\/assets\/icons\/lucide-pencil-ruler\.svg"/);
  assert.match(html, /<label class="sr-only" for="demoScenario">Demo scenario<\/label>/);
  assert.match(html, /id="bottomToggle"[^>]*aria-label="Hide lower panels"[^>]*><img class="control-icon panel-close-icon"/);
  assert.match(css, /\.scenario-control select\s*\{[^}]*opacity:\s*0;/);
  assert.match(app, /bottomToggle\.setAttribute\("aria-label", bottomToggle\.title\)/);
  assert.match(app, /wiringToggle\.setAttribute\("aria-label", wiringToggle\.title\)/);
  for (const icon of ["pencil-ruler", "list-filter", "panel-bottom-close", "panel-bottom-open"]) {
    assert.ok(fs.existsSync(path.join(root, "assets", "icons", `lucide-${icon}.svg`)));
  }
});

test("display settings save, restore, and reset without changing wiring", () => {
  const run = dashboard();
  assert.equal(run("appState.ui.display.surface"), "clean");
  assert.equal(run("appState.ui.display.grid"), false);
  run("globalThis.document = { body: { dataset: {} }, querySelectorAll: () => [] }; globalThis.requestAnimationFrame = () => {};");
  const wiringBefore = run("JSON.stringify(appState.wiring)");
  run('setDisplaySetting("surface", "panel"); setDisplaySetting("grid", true); setDisplaySetting("textSize", "large")');
  const saved = run.storage.get("samelco-scada-ui-v1");
  assert.equal(JSON.parse(saved).display.surface, "panel");
  assert.equal(JSON.parse(saved).display.grid, true);
  assert.equal(run("document.body.dataset.textSize"), "large");
  assert.equal(run("JSON.stringify(appState.wiring)"), wiringBefore);
  const restored = dashboard({ "samelco-scada-ui-v1": saved });
  assert.equal(restored("appState.ui.display.surface"), "panel");
  assert.equal(restored("appState.ui.display.grid"), true);
  run("resetDisplaySettings()");
  assert.equal(run("appState.ui.display.surface"), "clean");
  assert.equal(run("appState.ui.display.grid"), false);
  assert.equal(run("JSON.stringify(appState.wiring)"), wiringBefore);
  assert.equal(JSON.parse(run.storage.get("samelco-scada-ui-v1")).display.surface, "clean");
  const invalid = dashboard({ "samelco-scada-ui-v1": JSON.stringify({ display: { surface: "unknown", grid: "yes", textSize: "huge" } }) });
  assert.equal(invalid("appState.ui.display.surface"), "clean");
  assert.equal(invalid("appState.ui.display.grid"), false);
  assert.equal(invalid("appState.ui.display.textSize"), "normal");
});

test("display settings keep status colors and wiring markup intact", () => {
  const html = read("index.html");
  const css = read("src/css/styles.css");
  assert.match(html, /id="settingsToggle"[^>]*aria-controls="settingsPanel"/);
  assert.match(html, /id="settingsPanel"[^>]*hidden/);
  assert.match(css, /body\[data-surface="clean"\] \.feeder-card\.stale/);
  assert.match(css, /body\[data-grid="off"\] \.diagram-panel/);
  assert.match(css, /body\[data-motion="off"\] \.wire-pulse\s*\{\s*display:\s*none/);
  assert.ok(fs.existsSync(path.join(root, "assets", "icons", "lucide-settings-2.svg")));
  const run = dashboard();
  run('appState.activeEvent = "commLost"');
  assert.equal(run('statusClass(getScenario().substations[2].transformers[0])'), "stale");
});

test("normal-mode fluctuation stays bounded around nominal feeder values", () => {
  const run = dashboard();
  run("for (let step = 0; step < 500; step++) fluctuateFeeders(step * 5000)");
  const maxVoltageOffset = run("Math.max(...baseFeeders.map((f, i) => Math.abs(f.voltage - nominalFeeders[i].voltage)))");
  const maxPowerOffset = run("Math.max(...baseFeeders.map((f, i) => Math.abs(f.mw - nominalFeeders[i].mw)))");
  assert.ok(maxVoltageOffset <= 0.02 + 1e-9);
  assert.ok(maxPowerOffset <= 0.004 + 1e-9);
});
