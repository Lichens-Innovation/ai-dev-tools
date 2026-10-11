# react-flow-canvas-geometry

Computes React Flow (@xyflow) canvas geometry correctly so labels and edges land where intended instead of on top of a node.

## Triggers

Loaded when placing or offsetting edge labels, reimplementing `getBezierPath` maths outside the renderer (e.g. in a seed or layout package), bending an edge through a moved label, deciding where a node ends, or debugging an element that renders in the wrong place on the canvas.

## What it contains

- `SKILL.md`: the geometry rules for edge label anchors, bezier control points, handle coordinates and node bounds.
- `scripts/check-bezier-model.mjs`: a differential harness that checks a reimplementation of the edge-label anchor against React Flow's real `getBezierPath`. It needs `@xyflow/react` resolvable from where it runs.

## Related

- `react` plugin: `react-flow` skill for setting up and using @xyflow/react
