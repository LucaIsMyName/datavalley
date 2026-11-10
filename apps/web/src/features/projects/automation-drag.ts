/** A position event is saved only after the pointer is released. Mid-drag frames stay inside the canvas. */
export function shouldCommitNodePosition(change: { type: string; dragging?: boolean; position?: { x: number; y: number } }) {
  return change.type === 'position' && change.dragging === false && change.position != null
}
