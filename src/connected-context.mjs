// Traverse placements, not reusable components: a second appearance is a separate node.
export function connectedPlacementContext(context, placementId) {
  const neighbors = new Map(context.placements.map(placement => [placement.id, []]));
  if (!neighbors.has(placementId)) throw new Error('Select a placement on this board.');
  for (const edge of context.relationships) {
    neighbors.get(edge.sourcePlacementId).push(edge.targetPlacementId);
    neighbors.get(edge.targetPlacementId).push(edge.sourcePlacementId);
  }
  const connected = new Set([placementId]);
  const pending = [placementId];
  while (pending.length) {
    for (const neighbor of neighbors.get(pending.pop())) {
      if (connected.has(neighbor)) continue;
      connected.add(neighbor);
      pending.push(neighbor);
    }
  }
  const placements = context.placements.filter(placement => connected.has(placement.id));
  const componentIds = new Set(placements.map(placement => placement.componentId));
  return {
    ...context,
    scope: { kind: 'connected-placements', placementId },
    components: context.components.filter(component => componentIds.has(component.id)),
    placements,
    relationships: context.relationships.filter(edge => connected.has(edge.sourcePlacementId)),
    notes: [],
  };
}
