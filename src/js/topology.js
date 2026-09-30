// Draft mapping only. Replace these assignments after checking the utility's approved one-line.
const SCADATopology = (() => {
  const draftFeederLinks = Object.fromEntries(Array.from({ length: 15 }, (_, index) => {
    const number = index + 1;
    const transformerId = number <= 4 ? "cat-t1"
      : number === 5 ? "cat-t2"
        : number <= 9 ? "main-t1"
          : number <= 12 ? "vil-t1" : "bag-t1";
    return [`feeder-${number}`, transformerId];
  }));

  function validateWiring(substations, feeders, wiring) {
    const transformerIds = new Set(substations.flatMap((station) => station.transformers.map((item) => item.id)));
    const feederIds = new Set(feeders.map((item) => item.id));
    const errors = [];
    for (const feeder of feeders) {
      const parent = wiring.feederLinks[feeder.id];
      if (parent !== null && !transformerIds.has(parent)) errors.push(`${feeder.id}: unknown transformer`);
      if (!["OPEN", "CLOSED", "TRIPPED"].includes(wiring.feederBreakers[feeder.id])) errors.push(`${feeder.id}: invalid breaker`);
    }
    for (const id of transformerIds) {
      if (typeof wiring.sourceLinks[id] !== "boolean") errors.push(`${id}: invalid source link`);
      if (!["OPEN", "CLOSED"].includes(wiring.transformerBreakers[id])) errors.push(`${id}: invalid breaker`);
    }
    if (wiring.tie) {
      const { sourceId, targetId } = wiring.tie;
      if (!feederIds.has(sourceId) || !feederIds.has(targetId) || sourceId === targetId) errors.push("Invalid feeder tie endpoints");
      if (!["OPEN", "TRIPPED"].includes(wiring.feederBreakers[targetId])) errors.push("Tie target upstream breaker must be open");
    }
    return errors;
  }

  function evaluate(substations, feeders, wiring) {
    const errors = validateWiring(substations, feeders, wiring);
    if (errors.length) return { errors, powered: new Set(), edges: [] };

    const edges = [];
    for (const station of substations) {
      for (const transformer of station.transformers) {
        edges.push({ from: "NGCP", to: transformer.id, closed: wiring.sourceLinks[transformer.id] && transformer.breaker === "CLOSED" });
        edges.push({ from: transformer.id, to: `bus:${transformer.id}`, closed: true });
      }
    }
    for (const feeder of feeders) {
      const transformerId = wiring.feederLinks[feeder.id];
      if (transformerId) {
        edges.push({ from: `bus:${transformerId}`, to: feeder.id, closed: feeder.breaker === "CLOSED" });
      }
    }
    if (wiring.tie) {
      const target = feeders.find((feeder) => feeder.id === wiring.tie.targetId);
      edges.push({ from: wiring.tie.sourceId, to: wiring.tie.targetId, closed: target.breaker === "OPEN", type: "tie" });
    }

    const powered = new Set(["NGCP"]);
    const queue = ["NGCP"];
    while (queue.length) {
      const from = queue.shift();
      for (const edge of edges) {
        if (edge.from !== from || !edge.closed || powered.has(edge.to)) continue;
        powered.add(edge.to);
        queue.push(edge.to);
      }
    }
    return { errors: [], powered, edges };
  }

  function previewTransfer(scenario, wiring, sourceId, targetId, nominalFeeder) {
    const source = scenario.feeders.find((item) => item.id === sourceId);
    const target = scenario.feeders.find((item) => item.id === targetId);
    const transformer = scenario.substations.flatMap((station) => station.transformers)
      .find((item) => item.id === source?.transformerId);
    const reasons = [];
    if (wiring.tie) reasons.push("Open the existing tie first.");
    if (!source || !target || sourceId === targetId) reasons.push("Choose two different feeders.");
    if (source && (!source.energized || source.breaker !== "CLOSED")) reasons.push("Source feeder is not powered through a closed breaker.");
    if (source?.quality === "STALE" || target?.quality === "STALE") reasons.push("COMM LOST: current field state is unknown.");
    if (target?.breaker === "TRIPPED") reasons.push("Destination feeder is tripped.");
    if (!transformer) reasons.push("Source transformer is unavailable.");
    const alreadyOnSource = source?.transformerId === target?.transformerId && target?.energized;
    const addedMVA = nominalFeeder && nominalFeeder.pf > 0 && !alreadyOnSource ? nominalFeeder.mw / nominalFeeder.pf : 0;
    const projectedMVA = transformer ? transformer.load / Math.max(transformer.pf, 0.01) + addedMVA : 0;
    if (transformer && projectedMVA > transformer.capacity) reasons.push(`Projected ${projectedMVA.toFixed(1)} MVA exceeds ${transformer.capacity} MVA rating.`);
    return { ok: reasons.length === 0, reasons, addedMVA, projectedMVA, ratingMVA: transformer?.capacity || 0 };
  }

  return { draftFeederLinks, validateWiring, evaluate, previewTransfer };
})();

if (typeof module !== "undefined") module.exports = SCADATopology;
