# SCADA one-line demo

Open `index.html` in a browser. This is a local simulation, not a live SCADA client and not a field switching interface. It sends no equipment commands.

`src/js/topology.js` contains the provisional F1-F15 transformer assignment, graph evaluation, wiring validation, and feeder transfer preview. `src/js/app.js` contains simulated measurements, event scenarios, rendering, and browser-local edits. Changes made in **Simulation Edit** are saved in this browser's local storage; the normal view is read-only. Recent simulation edits appear in the event log. The NGCP panel and lower dashboard panels can be minimized. Their visibility, the selected demo scenario from the toolbar dropdown, and event filter are also saved locally. Simulation Edit always starts off after reload.

The NGCP sidebar can flip between source readings and a simulated event stream. The stream adds a new sample every five seconds, keeps the newest entry at the top, and records scenario and draft-edit changes. It is not connected to field telemetry. The selected sidebar face is saved locally.

## Display settings

Open the gear icon in the control bar. **Surface** switches between the default borderless Clean view and the original Panel view. Background grid, power glow, motion, and text size can be changed independently. Changes apply immediately and are saved in this browser's local storage. **Reset Display** restores the Clean defaults without changing the demo scenario, draft wiring, or equipment status. These settings affect presentation only; red/off, amber/stale, and green/powered meanings remain the same.

The graph energizes equipment only through closed paths from NGCP. Telemetry quality is separate from electrical state: **COMM LOST / STALE** keeps the last known state visible in amber and does not claim that equipment is off. A draft feeder transfer opens the destination's upstream breaker before connecting the tie. The preview checks source availability, stale/tripped status, and estimated transformer MVA against the demo rating. This is not a protection study or switching authorization.

Before replacing demo data with field telemetry, obtain the approved SAMELCO II one-line diagram, feeder-to-transformer assignments, actual tie switch endpoints, voltage levels, equipment ratings, breaker identifiers, and protection/operating rules. Do not assume that any feeder pair shown in the draft selector has a physical tie.

## Project layout

```
index.html              Dashboard page
src/js/topology.js      Draft feeder mapping, graph evaluation, transfer preview
src/js/app.js           Simulated data, scenarios, rendering, local storage
src/css/styles.css      Dashboard styles and display-setting themes
assets/icons/           Lucide icons (ISC license in LUCIDE-LICENSE.txt)
assets/images/          Utility logos
tests/dashboard.test.js Node test suite
```

## Commands

No dependencies are required. Node.js 18 or newer is needed for the scripts.

- `npm test` runs the dashboard tests (`node --test tests/dashboard.test.js`).
- `npm run check` syntax-checks the JavaScript files.
- `npm start` serves the folder at http://localhost:8080 with `http-server` (downloaded by `npx` on first use). Opening `index.html` directly also works.
