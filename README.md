# SCADA one-line demo

Open `index.html` in a browser. This is a local simulation, not a live SCADA client and not a field switching interface. It sends no equipment commands.

`topology.js` contains the provisional F1-F15 transformer assignment, graph evaluation, wiring validation, and feeder transfer preview. `app.js` contains simulated measurements, event scenarios, rendering, and browser-local edits. Changes made in **Simulation Edit** are saved in this browser's local storage; the normal view is read-only. Recent simulation edits appear in the event log. The NGCP panel and lower dashboard panels can be minimized. Their visibility, the selected demo scenario from the toolbar dropdown, and event filter are also saved locally. Simulation Edit always starts off after reload.

The graph energizes equipment only through closed paths from NGCP. Telemetry quality is separate from electrical state: **COMM LOST / STALE** keeps the last known state visible in amber and does not claim that equipment is off. A draft feeder transfer opens the destination's upstream breaker before connecting the tie. The preview checks source availability, stale/tripped status, and estimated transformer MVA against the demo rating. This is not a protection study or switching authorization.

Before replacing demo data with field telemetry, obtain the approved SAMELCO II one-line diagram, feeder-to-transformer assignments, actual tie switch endpoints, voltage levels, equipment ratings, breaker identifiers, and protection/operating rules. Do not assume that any feeder pair shown in the draft selector has a physical tie.

Run the topology tests with `node --test topology.test.js`.
