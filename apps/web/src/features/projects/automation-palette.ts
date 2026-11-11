/** Place a clicked step under the lowest node so repeated clicks do not stack. */
export function paletteStepPosition(nodes: { position: { x: number; y: number } }[]) {
  if (nodes.length === 0) return { x: 80, y: 80 }
  const lowest = nodes.reduce((max, node) => Math.max(max, node.position.y), 0)
  return { x: 80, y: lowest + 140 }
}
