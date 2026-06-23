import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { MaestroWorkflowV3, MaestroNodeV3, MaestroEdgeV3, MaestroInstanceV3 } from "../utils/maestro";
import InstancePicker, {
  blankInstancePicker,
  resolveInstanceFromPicker,
  type InstancePickerValue,
} from "./instance-picker";
import InstanceSkillPicker, { emptySelection, type SkillSelection } from "./instance-skill-picker";

// Static import — rendering is gated by `mounted` to avoid SSR issues.
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  Panel,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  ConnectionMode,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";

interface WorkflowCanvasProps {
  workflow: MaestroWorkflowV3 | null;
  /** Pass activeWorkflowIdx so the canvas can detect a workflow switch and bypass the echo guard. */
  workflowKey: number;
  availableAgents: string[];
  availableSkills: string[];
  instances: MaestroInstanceV3[];
  onChange: (w: MaestroWorkflowV3) => void;
  onInstancesChange: (instances: MaestroInstanceV3[]) => void;
}

// ── Dagre layout ────────────────────────────────────────────────────

// Estimated rendered height of a node, so dagre spaces skill-heavy agent nodes apart
// instead of overlapping them. Each skill chip wraps onto ~its own row (~30px).
function dagreNodeHeight(n: Node): number {
  const inst = n.data?.instanceData as MaestroInstanceV3 | undefined;
  const skills = (inst?.loaded_skills?.length ?? 0) + (inst?.referenced_skills?.length ?? 0);
  return 60 + skills * 30;
}

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 60 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: 180, height: dagreNodeHeight(n) });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 90, y: pos.y - dagreNodeHeight(n) / 2 } };
  });
}

// ── Helpers: MaestroWorkflowV3 <-> React Flow ──────────────────────────

function workflowToRfNodes(workflow: MaestroWorkflowV3, instances: MaestroInstanceV3[]): Node[] {
  const nodes: Node[] = [
    {
      id: "main-session",
      type: "mainSession",
      position: { x: 0, y: 0 },
      data: {},
      deletable: false,
    },
  ];
  for (const n of workflow.nodes) {
    const instanceData = n.type === "agent" ? instances.find((i) => i.name === n.instance) : undefined;
    const rfType = n.type === "agent" ? "agentNode" : n.type === "skill" ? "skillNode" : "humanStep";
    nodes.push({
      id: n.id,
      type: rfType,
      position: n.position ?? { x: 0, y: 0 },
      data: { maestroNode: n, instanceData },
    });
  }
  return nodes;
}

function workflowToRfEdges(workflow: MaestroWorkflowV3): Edge[] {
  return workflow.edges.map((e, i) => ({
    id: `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    sourceHandle: e.sourceHandle ?? (e.kind === "condition" ? "right" : "bottom"),
    target: e.to,
    targetHandle: e.targetHandle ?? "top",
    type: e.kind === "condition" ? "conditionEdge" : "successEdge",
    label: e.label,
    animated: e.kind === "condition",
    style: e.kind === "condition" ? { stroke: "#f97316", strokeDasharray: "5 4" } : undefined,
    data: { maestroEdge: e },
  }));
}

function rfNodesToMaestroNodes(nodes: Node[]): MaestroNodeV3[] {
  return nodes
    .filter((n) => n.id !== "main-session")
    .map((n) => {
      const maestro = n.data.maestroNode as MaestroNodeV3;
      return { id: maestro.id, type: maestro.type, instance: maestro.instance, skill: maestro.skill, position: n.position };
    });
}

function rfEdgesToMaestroEdges(edges: Edge[]): MaestroEdgeV3[] {
  return edges.map((e) => {
    const maestro = e.data?.maestroEdge as MaestroEdgeV3 | undefined;
    return {
      from: e.source,
      to: e.target,
      kind: (maestro?.kind ?? (e.type === "conditionEdge" ? "condition" : "success")) as "success" | "condition",
      label: typeof e.label === "string" ? e.label : maestro?.label,
      label_offset: maestro?.label_offset,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    };
  });
}

function isSuccessEdge(e: Edge): boolean {
  return (
    e.type === "successEdge" ||
    ((e.data as Record<string, unknown> | undefined)?.maestroEdge as MaestroEdgeV3 | undefined)?.kind === "success"
  );
}

// Walk the success path from main-session; the last node reached is the terminal
function findSuccessTerminalId(edges: Edge[]): string {
  let terminalId = "main-session";
  const visited = new Set<string>();
  while (!visited.has(terminalId)) {
    visited.add(terminalId);
    const next = edges.find((e) => e.source === terminalId && isSuccessEdge(e));
    if (!next) break;
    terminalId = next.target;
  }
  return terminalId;
}

// Strip any existing outgoing success edge from a given source node.
// Enforces the "at most one success edge per node" constraint.
function replaceSuccessEdgeFrom(edges: Edge[], sourceId: string): Edge[] {
  return edges.filter((e) => !(e.source === sourceId && isSuccessEdge(e)));
}

// Generate a unique human-review node id of the form "human_review-N"
function nextHumanId(nodes: Node[]): string {
  let n = 1;
  while (nodes.some((nd) => nd.id === `human_review-${n}`)) n++;
  return `human_review-${n}`;
}

// Generate a unique skill-step node id of the form "skill-N"
function nextSkillId(nodes: Node[]): string {
  let n = 1;
  while (nodes.some((nd) => nd.id === `skill-${n}`)) n++;
  return `skill-${n}`;
}

// ── Node components (defined outside — stable references for React Flow) ──

function MainSessionNode({
  data,
}: NodeProps & {
  data: { onAddNext?: (id: string) => void };
}) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Left} id="left" style={{ top: "50%" }} />
      <Handle type="source" position={Position.Right} id="right" style={{ top: "50%" }} />
      <div className="relative select-none">
        <div className="w-48 rounded-2xl border-2 border-green-400 bg-green-100 shadow-sm">
          {/* Header row */}
          <div className="flex items-center px-2.5 py-2">
            <span className="text-green-800 text-[12px] font-semibold">Claude Main Session</span>
          </div>
        </div>
        {/* Bottom "+" — add next step */}
        <button
          type="button"
          style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)" }}
          className="w-5 h-5 rounded-full bg-white border-2 border-green-400 text-green-600 text-[11px] font-bold flex items-center justify-center cursor-pointer z-10 shadow-sm hover:bg-green-50 focus:outline-none"
          onClick={(e) => {
            e.stopPropagation();
            data.onAddNext?.("main-session");
          }}
          title="Add next step"
        >
          +
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </>
  );
}

function AgentNodeComponent({
  data,
  selected,
}: NodeProps & {
  data: {
    maestroNode: MaestroNodeV3;
    instanceData?: MaestroInstanceV3;
    onDelete?: (id: string) => void;
    onEditInstance?: (instanceName: string) => void;
    onAddConditionEdge?: (id: string) => void;
    onAddNext?: (id: string) => void;
    isPickingConditionSource?: boolean;
    isTerminal?: boolean;
  };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const maestro = data.maestroNode;
  const inst = data.instanceData;
  const term = !!data.isTerminal;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const sideButtonClass = `w-5 h-5 rounded-full bg-white border-2 text-orange-500 text-[11px] font-bold flex items-center justify-center cursor-pointer z-10 shadow-sm focus:outline-none transition-all ${
    data.isPickingConditionSource
      ? "border-orange-500 animate-pulse scale-125"
      : "border-orange-300 hover:bg-orange-50 hover:border-orange-500"
  }`;

  // Terminal node renders green (task-complete); others orange.
  const cardClass = term
    ? `bg-green-50 text-green-900 ${selected ? "border-green-500" : "border-green-300"}`
    : `bg-orange-50 text-orange-900 ${selected ? "border-orange-500" : "border-orange-200"}`;
  const nameClass = term ? "text-green-900" : "text-orange-900";
  const subClass = term ? "text-green-600" : "text-orange-500";
  const kebabClass = term ? "text-green-500 hover:bg-green-100" : "text-orange-400 hover:bg-orange-100";
  const chipClass = term
    ? "bg-green-100 border-green-300 text-green-700"
    : "bg-orange-100 border-orange-200 text-orange-700";

  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Left} id="left" style={{ top: "50%" }} />
      <Handle type="source" position={Position.Right} id="right" style={{ top: "50%" }} />
      <div className="relative">
        {/* Left condition + button */}
        <button
          type="button"
          style={{ position: "absolute", left: -10, top: "50%", transform: "translateY(-50%)" }}
          className={sideButtonClass}
          onClick={(e) => {
            e.stopPropagation();
            data.onAddConditionEdge?.(maestro.id);
          }}
          title="Add condition from this node"
        >
          +
        </button>

        {/* Right condition + button */}
        <button
          type="button"
          style={{ position: "absolute", right: -10, top: "50%", transform: "translateY(-50%)" }}
          className={sideButtonClass}
          onClick={(e) => {
            e.stopPropagation();
            data.onAddConditionEdge?.(maestro.id);
          }}
          title="Add condition from this node"
        >
          +
        </button>

        <div className={`w-44 rounded-lg border-2 shadow-sm transition-colors ${cardClass}`}>
          <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
            <div className="flex flex-col min-w-0 flex-1">
              {/* Instance name (primary) */}
              <span className={`font-mono text-[12px] font-semibold truncate ${nameClass}`}>
                {maestro.instance ?? maestro.id}
              </span>
              {/* Agent name (secondary) */}
              {inst && <span className={`text-[10px] truncate font-mono ${subClass}`}>@{inst.agent}</span>}
            </div>
            <div className="relative ml-1 shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer focus:outline-none ${kebabClass}`}
              >
                ⋮
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-6 z-50 w-40 bg-(--bg) border border-(--line) rounded-lg shadow-lg py-1">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-[12px] text-(--ink-2) hover:bg-(--bg-elev) cursor-pointer"
                    onClick={() => {
                      data.onEditInstance?.(maestro.instance ?? maestro.id);
                      setMenuOpen(false);
                    }}
                  >
                    Edit instance
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-[12px] text-red-500 hover:bg-(--bg-elev) cursor-pointer"
                    onClick={() => {
                      data.onDelete?.(maestro.id);
                      setMenuOpen(false);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Skill chips from instance: loaded (solid) auto-load at start; referenced (dashed) are available on demand. */}
          {inst && inst.loaded_skills.length + inst.referenced_skills.length > 0 && (
            <div className="px-2.5 pb-2 flex flex-wrap gap-1">
              {inst.loaded_skills.map((s) => (
                <span key={s} className={`px-1.5 py-0.5 rounded-full border text-[10px] font-mono ${chipClass}`}>
                  {s}
                </span>
              ))}
              {inst.referenced_skills.map((s) => (
                <span
                  key={s}
                  title="Referenced — loaded only if the task needs it"
                  className={`px-1.5 py-0.5 rounded-full border border-dashed text-[10px] font-mono opacity-70 ${chipClass}`}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Bottom "+" — add next step */}
        <button
          type="button"
          style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)" }}
          className={`w-5 h-5 rounded-full bg-white border-2 text-[11px] font-bold flex items-center justify-center cursor-pointer z-10 shadow-sm hover:opacity-80 focus:outline-none ${term ? "border-green-400 text-green-600" : "border-orange-300 text-orange-500"}`}
          onClick={(e) => {
            e.stopPropagation();
            data.onAddNext?.(maestro.id);
          }}
          title="Add next step"
        >
          +
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </>
  );
}

function HumanStepNode({
  data,
  selected,
}: NodeProps & { data: { maestroNode: MaestroNodeV3; onAddNext?: (id: string) => void } }) {
  const maestro = data.maestroNode;
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <div className="relative" style={{ width: 120, height: 60 }}>
        <div
          className={`flex items-center justify-center border-2 bg-amber-50 text-amber-800 ${selected ? "border-amber-500" : "border-amber-300"}`}
          style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", width: 120, height: 60 }}
        >
          <span className="text-[11px] font-medium text-amber-800">Review</span>
        </div>
        {/* Bottom "+" — add next step */}
        <button
          type="button"
          style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)" }}
          className="w-5 h-5 rounded-full bg-white border-2 border-amber-400 text-amber-600 text-[11px] font-bold flex items-center justify-center cursor-pointer z-10 shadow-sm hover:bg-amber-50 focus:outline-none"
          onClick={(e) => {
            e.stopPropagation();
            data.onAddNext?.(maestro.id);
          }}
          title="Add next step"
        >
          +
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </>
  );
}

function SkillNodeComponent({
  data,
  selected,
}: NodeProps & {
  data: {
    maestroNode: MaestroNodeV3;
    onDelete?: (id: string) => void;
    onChangeSkill?: (id: string) => void;
    onAddNext?: (id: string) => void;
  };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const maestro = data.maestroNode;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <div className="relative">
        <div
          className={`w-44 rounded-lg border-2 shadow-sm bg-violet-50 text-violet-900 ${selected ? "border-violet-500" : "border-violet-300"}`}
        >
          <div className="flex items-center justify-between px-2.5 py-2">
            <span className="font-mono text-[12px] font-semibold truncate text-violet-800">/{maestro.skill ?? maestro.id}</span>
            <div className="relative ml-1 shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                className="w-5 h-5 flex items-center justify-center rounded cursor-pointer focus:outline-none text-violet-400 hover:bg-violet-100"
              >
                ⋮
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-6 z-50 w-40 bg-(--bg) border border-(--line) rounded-lg shadow-lg py-1">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-[12px] text-(--ink-2) hover:bg-(--bg-elev) cursor-pointer"
                    onClick={() => {
                      data.onChangeSkill?.(maestro.id);
                      setMenuOpen(false);
                    }}
                  >
                    Change skill
                  </button>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-[12px] text-red-500 hover:bg-(--bg-elev) cursor-pointer"
                    onClick={() => {
                      data.onDelete?.(maestro.id);
                      setMenuOpen(false);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Bottom "+" — add next step */}
        <button
          type="button"
          style={{ position: "absolute", bottom: -10, left: "50%", transform: "translateX(-50%)" }}
          className="w-5 h-5 rounded-full bg-white border-2 border-violet-400 text-violet-600 text-[11px] font-bold flex items-center justify-center cursor-pointer z-10 shadow-sm hover:bg-violet-50 focus:outline-none"
          onClick={(e) => {
            e.stopPropagation();
            data.onAddNext?.(maestro.id);
          }}
          title="Add next step"
        >
          +
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </>
  );
}

function SuccessEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ stroke: "#94a3b8", strokeWidth: 1.5 }} />;
}

function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const typedData = data as { onEditLabel?: (id: string) => void; onLabelMove?: (id: string, offset: { x: number; y: number }) => void; maestroEdge?: MaestroEdgeV3 } | undefined;
  const onEditLabel = typedData?.onEditLabel;
  const onLabelMove = typedData?.onLabelMove;
  const storedOffset = typedData?.maestroEdge?.label_offset;

  const { getViewport } = useReactFlow();
  const localOffsetRef = useRef<{ x: number; y: number }>(storedOffset ?? { x: 0, y: 0 });
  const [displayOffset, setDisplayOffset] = useState<{ x: number; y: number }>(storedOffset ?? { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  // Sync display when stored offset changes (e.g. on save/load)
  useEffect(() => {
    const off = storedOffset ?? { x: 0, y: 0 };
    localOffsetRef.current = off;
    setDisplayOffset(off);
  }, [storedOffset?.x, storedOffset?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { mx: e.clientX, my: e.clientY, ox: localOffsetRef.current.x, oy: localOffsetRef.current.y };
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const { zoom } = getViewport();
    const dx = (e.clientX - dragStartRef.current.mx) / zoom;
    const dy = (e.clientY - dragStartRef.current.my) / zoom;
    const next = { x: dragStartRef.current.ox + dx, y: dragStartRef.current.oy + dy };
    localOffsetRef.current = next;
    setDisplayOffset(next);
  }, [getViewport]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const { zoom } = getViewport();
    const dx = (e.clientX - dragStartRef.current.mx) / zoom;
    const dy = (e.clientY - dragStartRef.current.my) / zoom;
    const next = { x: dragStartRef.current.ox + dx, y: dragStartRef.current.oy + dy };
    localOffsetRef.current = next;
    dragStartRef.current = null;
    setIsDragging(false);
    onLabelMove?.(id, next);
  }, [id, getViewport, onLabelMove]);

  const hasLabel = typeof label === "string" && label.length > 0;
  const finalX = labelX + displayOffset.x;
  const finalY = labelY + displayOffset.y;

  // When the label has been repositioned, draw a quadratic bezier that passes through
  // the label position at t=0.5: CP = 2·label − (source+target)/2
  const hasOffset = displayOffset.x !== 0 || displayOffset.y !== 0;
  const activePath = hasOffset
    ? `M ${sourceX},${sourceY} Q ${2 * finalX - (sourceX + targetX) / 2},${2 * finalY - (sourceY + targetY) / 2} ${targetX},${targetY}`
    : edgePath;

  return (
    <>
      <BaseEdge
        id={id}
        path={activePath}
        markerEnd={markerEnd}
        style={{ stroke: "#f97316", strokeWidth: 1.5, strokeDasharray: "5 4" }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${finalX}px,${finalY}px)`,
            pointerEvents: "all",
            cursor: isDragging ? "grabbing" : "grab",
            userSelect: "none",
          }}
          className="flex items-center gap-1 nodrag nopan"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {hasLabel ? (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 border border-orange-300 text-orange-700 block max-w-[140px] truncate"
              title={String(label)}
            >
              {String(label)}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] italic bg-orange-50/70 border border-dashed border-orange-300 text-orange-400">
              no label
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditLabel?.(id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-4 h-4 flex items-center justify-center rounded bg-white border border-orange-300 text-orange-500 text-[9px] leading-none hover:bg-orange-50 cursor-pointer focus:outline-none shadow-sm"
            title="Edit label"
          >
            ✎
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Re-fits the viewport whenever the active workflow changes (fitView prop only fires on mount).
function FitViewEffect({ workflowName }: { workflowName: string | undefined }) {
  const { fitView } = useReactFlow();
  const prevRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (workflowName !== prevRef.current) {
      prevRef.current = workflowName;
      setTimeout(() => fitView({ padding: 0.4 }), 50);
    }
  }, [workflowName, fitView]);
  return null;
}

// Stable module-level constants — never recreated, so React Flow never remounts nodes.
const NODE_TYPES = {
  mainSession: MainSessionNode,
  agentNode: AgentNodeComponent,
  humanStep: HumanStepNode,
  skillNode: SkillNodeComponent,
};
const EDGE_TYPES = { successEdge: SuccessEdge, conditionEdge: ConditionEdge };

// ── Main component ──────────────────────────────────────────────────

export default function WorkflowCanvas({
  workflow,
  workflowKey,
  availableAgents,
  availableSkills,
  instances,
  onChange,
  onInstancesChange,
}: WorkflowCanvasProps) {
  const [mounted, setMounted] = useState(false);
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const rfNodesRef = useRef<Node[]>([]);
  const rfEdgesRef = useRef<Edge[]>([]);
  rfNodesRef.current = rfNodes;
  rfEdgesRef.current = rfEdges;
  // Tracks the last workflow object we emitted so the sync effect can ignore the echo
  const lastEmittedRef = useRef<MaestroWorkflowV3 | null>(null);

  // Condition edge state machine
  const [conditionSourceNodeId, setConditionSourceNodeId] = useState<string | null>(null);
  const [conditionModalOpen, setConditionModalOpen] = useState(false);
  const [conditionLabel, setConditionLabel] = useState("");
  const [conditionTargetNodeId, setConditionTargetNodeId] = useState("");
  const [conditionPicker, setConditionPicker] = useState<InstancePickerValue>(blankInstancePicker());

  // Edit instance modal
  const [editInstanceName, setEditInstanceName] = useState<string | null>(null);
  const [editInstanceAgent, setEditInstanceAgent] = useState("");
  const [editInstanceSkills, setEditInstanceSkills] = useState<SkillSelection>(emptySelection());

  // Edit condition-edge label modal
  const [editLabelEdgeId, setEditLabelEdgeId] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");

  // Change-skill modal (skill nodes)
  const [changeSkillNodeId, setChangeSkillNodeId] = useState<string | null>(null);
  const [changeSkillValue, setChangeSkillValue] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Track the previous workflowKey to detect switches between workflows
  const prevKeyRef = useRef(workflowKey);

  // Sync incoming workflow → RF state (always produces at least the main-session node)
  useEffect(() => {
    if (!workflow) return;
    const switched = prevKeyRef.current !== workflowKey;
    prevKeyRef.current = workflowKey;
    // Skip if this is the echo of our own pushChange — but always rebuild on a workflow switch
    if (!switched && workflow === lastEmittedRef.current) return;
    // Clear the last-emitted ref on switch so subsequent edits don't stale-match the old workflow
    if (switched) lastEmittedRef.current = null;
    let nodes = workflowToRfNodes(workflow, instances);
    const edges = workflowToRfEdges(workflow);
    const hasPositions = workflow.nodes.length > 0 && workflow.nodes.every((n) => n.position != null);
    if (!hasPositions) nodes = applyDagreLayout(nodes, edges);
    setRfNodes(nodes);
    setRfEdges(edges);
  }, [workflow, instances, workflowKey]);

  const pushChange = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (!workflow) return;
      const updated: MaestroWorkflowV3 = { ...workflow, nodes: rfNodesToMaestroNodes(nodes), edges: rfEdgesToMaestroEdges(edges) };
      lastEmittedRef.current = updated; // mark so the sync effect ignores the echo
      onChange(updated);
    },
    [workflow, onChange]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, rfNodesRef.current);
      setRfNodes(next);
      // Push only when there is a structural change worth saving:
      // - position: only on drag-end (dragging === false) — not on every mousemove
      // - dimensions / select: React Flow internal bookkeeping, never push
      // - everything else (add, remove, reset): push immediately
      const shouldPush = changes.some(
        (c) =>
          (c.type === "position" && c.dragging === false) ||
          (c.type !== "position" && c.type !== "dimensions" && c.type !== "select")
      );
      if (shouldPush) pushChange(next, rfEdgesRef.current);
    },
    [pushChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const next = applyEdgeChanges(changes, rfEdgesRef.current);
      setRfEdges(next);
      pushChange(rfNodesRef.current, next);
    },
    [pushChange]
  );

  const handleConnect = useCallback(
    (params: Connection) => {
      const isCondition = params.sourceHandle === "left" || params.sourceHandle === "right";
      const newEdge: Partial<Edge> = {
        ...params,
        type: isCondition ? "conditionEdge" : "successEdge",
        animated: isCondition,
        style: isCondition ? { stroke: "#f97316", strokeDasharray: "5 4" } : undefined,
        data: {
          maestroEdge: {
            from: params.source,
            to: params.target,
            kind: isCondition ? "condition" : "success",
            sourceHandle: params.sourceHandle ?? undefined,
            targetHandle: params.targetHandle ?? undefined,
          } as MaestroEdgeV3,
        },
      };
      setRfEdges((eds) => {
        // Enforce single success edge per source node
        const base = isCondition ? eds : replaceSuccessEdgeFrom(eds, params.source!);
        const next = addEdge(newEdge as Edge, base);
        pushChange(rfNodesRef.current, next);
        return next;
      });
    },
    [pushChange]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setRfNodes((nds) => {
        const next = nds.filter((n) => n.id !== nodeId);
        const nextEdges = rfEdgesRef.current.filter((e) => e.source !== nodeId && e.target !== nodeId);
        setRfEdges(nextEdges);
        pushChange(next, nextEdges);
        return next;
      });
    },
    [pushChange]
  );

  // ── Move condition-edge label ────────────────────────────────────

  const moveLabelOffset = useCallback(
    (edgeId: string, offset: { x: number; y: number }) => {
      const next = rfEdgesRef.current.map((e) => {
        if (e.id !== edgeId) return e;
        const maestro = e.data?.maestroEdge as MaestroEdgeV3 | undefined;
        // Round near-zero offsets back to undefined to keep maestro.json clean
        const cleanOffset = Math.abs(offset.x) < 0.5 && Math.abs(offset.y) < 0.5 ? undefined : offset;
        return {
          ...e,
          data: { ...e.data, maestroEdge: { ...(maestro as MaestroEdgeV3), label_offset: cleanOffset } },
        };
      });
      setRfEdges(next);
      pushChange(rfNodesRef.current, next);
    },
    [pushChange]
  );

  // ── Edit instance modal ──────────────────────────────────────────

  const openEditInstance = useCallback(
    (instanceName: string) => {
      const inst = instances.find((i) => i.name === instanceName);
      if (!inst) return;
      setEditInstanceName(instanceName);
      setEditInstanceAgent(inst.agent);
      setEditInstanceSkills({ loaded: inst.loaded_skills, referenced: inst.referenced_skills });
    },
    [instances]
  );

  const confirmEditInstance = useCallback(() => {
    if (!editInstanceName) return;
    onInstancesChange(
      instances.map((i) =>
        i.name === editInstanceName
          ? {
              ...i,
              agent: editInstanceAgent,
              loaded_skills: editInstanceSkills.loaded,
              referenced_skills: editInstanceSkills.referenced,
            }
          : i
      )
    );
    setEditInstanceName(null);
  }, [editInstanceName, editInstanceAgent, editInstanceSkills, instances, onInstancesChange]);

  // ── Edit condition-edge label ────────────────────────────────────

  const openEditLabel = useCallback((edgeId: string) => {
    const edge = rfEdgesRef.current.find((e) => e.id === edgeId);
    setEditLabelEdgeId(edgeId);
    setEditLabelValue(typeof edge?.label === "string" ? edge.label : "");
  }, []);

  const confirmEditLabel = useCallback(() => {
    if (!editLabelEdgeId) return;
    const trimmed = editLabelValue.trim();
    const next = rfEdgesRef.current.map((e) => {
      if (e.id !== editLabelEdgeId) return e;
      const maestro = e.data?.maestroEdge as MaestroEdgeV3 | undefined;
      // Keep `e.label` and `maestroEdge.label` in sync — rfEdgesToMaestroEdges reads `e.label`
      // first but falls back to maestro.label, so both must be cleared when emptied.
      return {
        ...e,
        label: trimmed || undefined,
        data: { ...e.data, maestroEdge: { ...(maestro as MaestroEdgeV3), label: trimmed || undefined } },
      };
    });
    setRfEdges(next);
    pushChange(rfNodesRef.current, next);
    setEditLabelEdgeId(null);
  }, [editLabelEdgeId, editLabelValue, pushChange]);

  // ── Change-skill modal (skill nodes) ────────────────────────────

  const openChangeSkill = useCallback(
    (nodeId: string) => {
      const node = rfNodesRef.current.find((n) => n.id === nodeId);
      const maestro = node?.data.maestroNode as MaestroNodeV3 | undefined;
      setChangeSkillNodeId(nodeId);
      setChangeSkillValue(maestro?.skill ?? availableSkills[0] ?? "");
    },
    [availableSkills]
  );

  const confirmChangeSkill = useCallback(() => {
    if (!changeSkillNodeId || !changeSkillValue) return;
    const next = rfNodesRef.current.map((n) => {
      if (n.id !== changeSkillNodeId) return n;
      const maestro = n.data.maestroNode as MaestroNodeV3;
      return { ...n, data: { ...n.data, maestroNode: { ...maestro, skill: changeSkillValue } } };
    });
    setRfNodes(next);
    pushChange(next, rfEdgesRef.current);
    setChangeSkillNodeId(null);
  }, [changeSkillNodeId, changeSkillValue, pushChange]);

  // Instances already placed in this workflow (for uniqueness enforcement)
  const placedInstanceNames = useMemo(
    () =>
      new Set(
        rfNodes
          .filter((n) => n.id !== "main-session" && (n.data.maestroNode as MaestroNodeV3 | undefined)?.type === "agent")
          .map((n) => (n.data.maestroNode as MaestroNodeV3).instance ?? "")
          .filter(Boolean)
      ),
    [rfNodes]
  );

  // Subagents (agent types) already placed in this workflow. A subagent can only
  // appear once per workflow — the SubagentStart hook keys off agent_type, so two
  // instances of the same agent would merge. Used to hide already-used subagents.
  const placedAgentTypes = useMemo(
    () =>
      new Set(
        Array.from(placedInstanceNames)
          .map((name) => instances.find((i) => i.name === name)?.agent)
          .filter(Boolean) as string[]
      ),
    [placedInstanceNames, instances]
  );

  // ── Condition state machine ──────────────────────────────────────

  const resetConditionState = useCallback(() => {
    setConditionSourceNodeId(null);
    setConditionModalOpen(false);
    setConditionLabel("");
    setConditionTargetNodeId("");
    setConditionPicker(blankInstancePicker());
  }, []);

  const openConditionModal = useCallback(
    (nodeId: string) => {
      setConditionSourceNodeId(nodeId);
      setConditionModalOpen(true);
      setConditionLabel("");
      setConditionTargetNodeId("");
      const firstFree = availableAgents.find((a) => !placedAgentTypes.has(a));
      setConditionPicker(blankInstancePicker(firstFree ?? ""));
    },
    [availableAgents, placedAgentTypes]
  );

  const handleStartAddCondition = useCallback(() => {
    if (conditionSourceNodeId === "__picking__") {
      resetConditionState();
    } else {
      setConditionSourceNodeId("__picking__");
    }
  }, [conditionSourceNodeId, resetConditionState]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (conditionSourceNodeId === "__picking__" && node.id !== "main-session") {
        openConditionModal(node.id);
      }
    },
    [conditionSourceNodeId, openConditionModal]
  );

  const confirmAddCondition = useCallback(() => {
    if (!conditionSourceNodeId || conditionSourceNodeId === "__picking__") return;

    const nextNodes = [...rfNodes];
    let targetId: string;

    if (conditionTargetNodeId) {
      // Targeting an existing node
      targetId = conditionTargetNodeId;
    } else {
      // Creating / reusing a node via the instance picker
      const resolved = resolveInstanceFromPicker(conditionPicker, {
        instances,
        placedNames: placedInstanceNames,
        availableAgents,
      });
      if (!resolved) return;
      const instanceName = resolved.instance.name;
      if (resolved.isNew) onInstancesChange([...instances, resolved.instance]);
      targetId = instanceName;
      const sourceNode = rfNodes.find((n) => n.id === conditionSourceNodeId);
      const position = {
        x: (sourceNode?.position.x ?? 0) + 240,
        y: sourceNode?.position.y ?? 0,
      };
      const newMaestroNode: MaestroNodeV3 = { id: instanceName, type: "agent", instance: instanceName, position };
      nextNodes.push({
        id: instanceName,
        type: "agentNode",
        position,
        data: { maestroNode: newMaestroNode, instanceData: resolved.instance },
      });
    }

    const newEdge: Edge = {
      id: `e-cond-${conditionSourceNodeId}-${targetId}-${rfEdges.length}`,
      source: conditionSourceNodeId,
      sourceHandle: "right",
      target: targetId,
      targetHandle: "top",
      type: "conditionEdge",
      label: conditionLabel || undefined,
      animated: true,
      style: { stroke: "#f97316", strokeDasharray: "5 4" },
      data: {
        maestroEdge: {
          from: conditionSourceNodeId,
          to: targetId,
          kind: "condition",
          label: conditionLabel || undefined,
          sourceHandle: "right",
          targetHandle: "top",
        } as MaestroEdgeV3,
      },
    };

    const nextEdges = [...rfEdges, newEdge];
    setRfNodes(nextNodes);
    setRfEdges(nextEdges);
    pushChange(nextNodes, nextEdges);
    resetConditionState();
  }, [
    conditionSourceNodeId,
    conditionTargetNodeId,
    conditionPicker,
    conditionLabel,
    rfNodes,
    rfEdges,
    instances,
    availableAgents,
    placedInstanceNames,
    onInstancesChange,
    pushChange,
    resetConditionState,
  ]);

  // ── Add step (per-node "+" button) ──────────────────────────────

  const [addStepSourceId, setAddStepSourceId] = useState<string | null>(null);
  const [addStepType, setAddStepType] = useState<"agent" | "human_review" | "skill">("agent");
  const [addStepPicker, setAddStepPicker] = useState<InstancePickerValue>(blankInstancePicker());
  const [addStepSkill, setAddStepSkill] = useState("");

  const resetAddStep = useCallback(() => {
    setAddStepSourceId(null);
    setAddStepType("agent");
    setAddStepPicker(blankInstancePicker());
    setAddStepSkill("");
  }, []);

  const openAddStep = useCallback(
    (sourceId: string) => {
      setAddStepSourceId(sourceId);
      setAddStepType("agent");
      const firstFree = availableAgents.find((a) => !placedAgentTypes.has(a));
      setAddStepPicker(blankInstancePicker(firstFree ?? ""));
      setAddStepSkill(availableSkills[0] ?? "");
    },
    [availableAgents, placedAgentTypes, availableSkills]
  );

  const confirmAddStep = useCallback(() => {
    if (!addStepSourceId || !workflow) return;

    const sourceNode = rfNodes.find((n) => n.id === addStepSourceId);
    const position = {
      x: sourceNode?.position.x ?? 0,
      y: (sourceNode?.position.y ?? 0) + 160,
    };

    let newRfNode: Node;
    let nodeId: string;

    if (addStepType === "agent") {
      const resolved = resolveInstanceFromPicker(addStepPicker, {
        instances,
        placedNames: placedInstanceNames,
        availableAgents,
      });
      if (!resolved) return;
      nodeId = resolved.instance.name;
      if (resolved.isNew) onInstancesChange([...instances, resolved.instance]);
      const maestroNode: MaestroNodeV3 = { id: nodeId, type: "agent", instance: nodeId, position };
      newRfNode = { id: nodeId, type: "agentNode", position, data: { maestroNode, instanceData: resolved.instance } };
    } else if (addStepType === "skill") {
      if (!addStepSkill) return;
      nodeId = nextSkillId(rfNodes);
      const maestroNode: MaestroNodeV3 = { id: nodeId, type: "skill", skill: addStepSkill, position };
      newRfNode = { id: nodeId, type: "skillNode", position, data: { maestroNode } };
    } else {
      // human_review
      nodeId = nextHumanId(rfNodes);
      const maestroNode: MaestroNodeV3 = { id: nodeId, type: "human_review", position };
      newRfNode = { id: nodeId, type: "humanStep", position, data: { maestroNode } };
    }

    const newEdge: Edge = {
      id: `e-${addStepSourceId}-${nodeId}`,
      source: addStepSourceId,
      sourceHandle: "bottom",
      target: nodeId,
      targetHandle: "top",
      type: "successEdge",
      data: {
        maestroEdge: {
          from: addStepSourceId,
          to: nodeId,
          kind: "success",
          sourceHandle: "bottom",
          targetHandle: "top",
        } as MaestroEdgeV3,
      },
    };

    const nextNodes = [...rfNodes, newRfNode];
    // Enforce single success edge per source: replace any existing success edge from addStepSourceId
    const nextEdges = [...replaceSuccessEdgeFrom(rfEdges, addStepSourceId), newEdge];
    setRfNodes(nextNodes);
    setRfEdges(nextEdges);
    pushChange(nextNodes, nextEdges);
    resetAddStep();
  }, [
    addStepSourceId,
    addStepType,
    addStepPicker,
    addStepSkill,
    workflow,
    rfNodes,
    rfEdges,
    instances,
    availableAgents,
    placedInstanceNames,
    onInstancesChange,
    pushChange,
    resetAddStep,
  ]);

  // ── Add Agent (bottom bar) — routes through add-step modal at terminal ──

  const handleAddAgent = useCallback(() => {
    if (!workflow) return;
    const terminalId = findSuccessTerminalId(rfEdges);
    openAddStep(terminalId);
  }, [workflow, rfEdges, openAddStep]);

  // ── Enriched nodes ───────────────────────────────────────────────

  const terminalId = useMemo(() => findSuccessTerminalId(rfEdges), [rfEdges]);

  const enrichedNodes = useMemo(
    () =>
      rfNodes.map((n) => {
        if (n.id === "main-session") {
          return {
            ...n,
            data: { onAddNext: openAddStep },
          };
        }
        const maestroNode = n.data.maestroNode as MaestroNodeV3;
        // Always resolve instanceData fresh from the instances prop so edit-instance updates are reflected immediately
        const instanceData = maestroNode.type === "agent" ? instances.find((i) => i.name === maestroNode.instance) : undefined;
        return {
          ...n,
          data: {
            ...n.data,
            instanceData,
            onDelete: deleteNode,
            onEditInstance: openEditInstance,
            onChangeSkill: openChangeSkill,
            onAddConditionEdge: openConditionModal,
            onAddNext: openAddStep,
            isPickingConditionSource: conditionSourceNodeId === "__picking__",
            isTerminal: n.id === terminalId,
          },
        };
      }),
    [
      rfNodes,
      instances,
      deleteNode,
      openEditInstance,
      openChangeSkill,
      openConditionModal,
      openAddStep,
      conditionSourceNodeId,
      terminalId,
    ]
  );

  // Thread the label editor and label-move handler into condition edges.
  const enrichedEdges = useMemo(
    () =>
      rfEdges.map((e) =>
        e.type === "conditionEdge"
          ? { ...e, data: { ...e.data, onEditLabel: openEditLabel, onLabelMove: moveLabelOffset } }
          : e
      ),
    [rfEdges, openEditLabel, moveLabelOffset]
  );

  if (!mounted) {
    return <div className="flex-1 flex items-center justify-center text-(--ink-2) text-[13px]">Loading canvas…</div>;
  }

  const isPicking = conditionSourceNodeId === "__picking__";
  // Available instances for reuse: exclude ones already placed in this workflow,
  // and ones whose subagent is already used (a subagent appears at most once).
  const availableForReuse = instances.filter((i) => !placedInstanceNames.has(i.name) && !placedAgentTypes.has(i.agent));
  // Subagents still selectable when creating a new node here.
  const availableAgentsForNew = availableAgents.filter((a) => !placedAgentTypes.has(a));
  const existingInstanceNames = instances.map((i) => i.name);
  // When editing an instance, keep its own subagent selectable but hide subagents
  // already taken by other instances in this workflow.
  const editInstanceOrigAgent = editInstanceName
    ? instances.find((i) => i.name === editInstanceName)?.agent
    : undefined;
  const editAvailableAgents = availableAgents.filter((a) => a === editInstanceOrigAgent || !placedAgentTypes.has(a));

  return (
    <div
      className={`flex-1 relative flex flex-col overflow-hidden ${isPicking ? "cursor-crosshair" : ""}`}
      style={{ minHeight: 400 }}
    >
      <ReactFlowProvider>
        <FitViewEffect workflowName={workflow?.name} />
        <ReactFlow
          nodes={enrichedNodes}
          edges={enrichedEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          connectionMode={ConnectionMode.Loose}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.4 }}
          className="bg-(--bg)"
        >
          <Background />
          <Controls />

          {/* Bottom action bar */}
          <Panel position="bottom-center" style={{ marginBottom: 16 }}>
            <div className="flex items-center gap-2 bg-(--bg) border border-(--line) rounded-xl px-3 py-2 shadow-lg">
              <button
                type="button"
                onClick={handleAddAgent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 cursor-pointer focus:outline-none transition-colors"
              >
                <span className="text-[14px] leading-none">+</span> Add Agent
              </button>
              <div className="w-px h-4 bg-(--line)" />
              <button
                type="button"
                onClick={handleStartAddCondition}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border cursor-pointer focus:outline-none transition-colors ${
                  isPicking
                    ? "border-orange-500 bg-orange-500 text-white"
                    : "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
                }`}
              >
                <span className="text-[14px] leading-none">+</span> {isPicking ? "Click a node…" : "Add condition"}
              </button>
              {isPicking && (
                <button
                  type="button"
                  onClick={resetConditionState}
                  className="px-2 py-1 text-[12px] text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
                >
                  Cancel
                </button>
              )}
            </div>
          </Panel>
        </ReactFlow>
      </ReactFlowProvider>

      {/* Condition modal */}
      {conditionModalOpen && (
        <div className="absolute inset-0 bg-black/30 z-20 flex items-center justify-center">
          <div className="bg-(--bg) border border-(--line) rounded-xl p-5 shadow-xl w-[40rem] flex flex-col gap-3">
            <div className="text-[13px] font-semibold text-(--ink)">Add condition</div>

            <textarea
              placeholder="Condition label (e.g. needs revision)"
              value={conditionLabel}
              autoFocus
              rows={4}
              onChange={(e) => setConditionLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") resetConditionState();
              }}
              className="w-full text-[12px] bg-(--bg-elev) border border-(--line) rounded px-2 py-1.5 text-(--ink) focus:outline-none focus:border-primary resize-none"
            />

            {/* Target: existing node or new instance */}
            <select
              value={conditionTargetNodeId}
              onChange={(e) => setConditionTargetNodeId(e.target.value)}
              className="w-full text-[12px] bg-(--bg-elev) border border-(--line) rounded px-2 py-1.5 text-(--ink) focus:outline-none focus:border-primary"
            >
              <option value="">New instance node…</option>
              {rfNodes
                .filter((n) => n.id !== conditionSourceNodeId && n.id !== "main-session")
                .map((n) => {
                  const maestro = n.data.maestroNode as MaestroNodeV3 | undefined;
                  const label = maestro?.type === "skill" ? `/${maestro.skill ?? maestro.id}` : (maestro?.instance ?? maestro?.id ?? n.id);
                  return (
                    <option key={n.id} value={n.id}>
                      {label}
                    </option>
                  );
                })}
            </select>

            {/* When creating a new node: instance picker */}
            {!conditionTargetNodeId && (
              <InstancePicker
                value={conditionPicker}
                onChange={setConditionPicker}
                availableAgents={availableAgentsForNew}
                availableSkills={availableSkills}
                reusableInstances={availableForReuse}
                existingInstanceNames={existingInstanceNames}
              />
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={resetConditionState}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddCondition}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-primary text-white cursor-pointer focus:outline-none hover:opacity-90"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add step modal */}
      {addStepSourceId && (
        <div className="absolute inset-0 bg-black/30 z-20 flex items-center justify-center">
          <div className="bg-(--bg) border border-(--line) rounded-xl p-5 shadow-xl w-80 flex flex-col gap-3">
            <div className="text-[13px] font-semibold text-(--ink)">Add step</div>

            {/* Type picker */}
            <div className="flex rounded-lg overflow-hidden border border-(--line)">
              <button
                type="button"
                onClick={() => setAddStepType("agent")}
                className={`flex-1 py-1.5 text-[12px] font-medium cursor-pointer focus:outline-none transition-colors ${addStepType === "agent" ? "bg-primary text-white" : "bg-(--bg-elev) text-(--ink-2) hover:bg-(--bg)"}`}
              >
                Agent
              </button>
              <button
                type="button"
                onClick={() => setAddStepType("skill")}
                className={`flex-1 py-1.5 text-[12px] font-medium cursor-pointer focus:outline-none transition-colors ${addStepType === "skill" ? "bg-primary text-white" : "bg-(--bg-elev) text-(--ink-2) hover:bg-(--bg)"}`}
              >
                Skill
              </button>
              <button
                type="button"
                onClick={() => setAddStepType("human_review")}
                className={`flex-1 py-1.5 text-[12px] font-medium cursor-pointer focus:outline-none transition-colors ${addStepType === "human_review" ? "bg-primary text-white" : "bg-(--bg-elev) text-(--ink-2) hover:bg-(--bg)"}`}
              >
                Human Review
              </button>
            </div>

            {/* Instance picker (only for agent type) */}
            {addStepType === "agent" && (
              <InstancePicker
                value={addStepPicker}
                onChange={setAddStepPicker}
                availableAgents={availableAgentsForNew}
                availableSkills={availableSkills}
                reusableInstances={availableForReuse}
                existingInstanceNames={existingInstanceNames}
                onEnter={confirmAddStep}
                onEscape={resetAddStep}
              />
            )}

            {/* Skill picker (only for skill type) — runs inline in the main session */}
            {addStepType === "skill" && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] text-subtle uppercase tracking-wide">Skill</div>
                {availableSkills.length === 0 ? (
                  <p className="text-[12px] text-subtle m-0">
                    No skills selected in the left panel. Add skills there first.
                  </p>
                ) : (
                  <select
                    value={addStepSkill}
                    onChange={(e) => setAddStepSkill(e.target.value)}
                    className="w-full text-[12px] bg-(--bg-elev) border border-(--line) rounded px-2 py-1.5 text-(--ink) focus:outline-none focus:border-primary"
                  >
                    {availableSkills.map((s) => (
                      <option key={s} value={s}>
                        /{s}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-subtle m-0">
                  The orchestrator runs this skill inline, between agent steps.
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={resetAddStep}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmAddStep}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-primary text-white cursor-pointer focus:outline-none hover:opacity-90"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit instance modal */}
      {editInstanceName && (
        <div className="absolute inset-0 bg-black/30 z-20 flex items-center justify-center">
          <div className="bg-(--bg) border border-(--line) rounded-xl p-5 shadow-xl w-80 flex flex-col gap-3">
            <div className="text-[13px] font-semibold text-(--ink)">
              Edit instance: <span className="font-mono">{editInstanceName}</span>
            </div>

            <div>
              <div className="text-[10px] text-subtle uppercase tracking-wide mb-1">Subagent</div>
              <select
                value={editInstanceAgent}
                onChange={(e) => setEditInstanceAgent(e.target.value)}
                className="w-full text-[12px] bg-(--bg-elev) border border-(--line) rounded px-2 py-1.5 text-(--ink) focus:outline-none focus:border-primary"
              >
                {editAvailableAgents.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
                {/* Keep current agent even if not in availableAgents */}
                {editInstanceAgent && !availableAgents.includes(editInstanceAgent) && (
                  <option value={editInstanceAgent}>{editInstanceAgent} (not in list)</option>
                )}
              </select>
            </div>

            <InstanceSkillPicker
              skills={availableSkills}
              value={editInstanceSkills}
              onChange={setEditInstanceSkills}
              maxHeight="max-h-48"
              size="md"
              emptyHint="No skills available. Add skills from the left panel first, then reopen this instance to assign them."
            />

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditInstanceName(null)}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEditInstance}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-primary text-white cursor-pointer focus:outline-none hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change-skill modal (skill nodes) */}
      {changeSkillNodeId && (
        <div className="absolute inset-0 bg-black/30 z-20 flex items-center justify-center">
          <div className="bg-(--bg) border border-(--line) rounded-xl p-5 shadow-xl w-72 flex flex-col gap-3">
            <div className="text-[13px] font-semibold text-(--ink)">Change skill</div>
            {availableSkills.length === 0 ? (
              <p className="text-[12px] text-subtle m-0">No skills selected in the left panel.</p>
            ) : (
              <select
                value={changeSkillValue}
                autoFocus
                onChange={(e) => setChangeSkillValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setChangeSkillNodeId(null);
                  if (e.key === "Enter") confirmChangeSkill();
                }}
                className="w-full text-[12px] bg-(--bg-elev) border border-(--line) rounded px-2 py-1.5 text-(--ink) focus:outline-none focus:border-primary"
              >
                {availableSkills.map((s) => (
                  <option key={s} value={s}>
                    /{s}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setChangeSkillNodeId(null)}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmChangeSkill}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-primary text-white cursor-pointer focus:outline-none hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit condition-label modal */}
      {editLabelEdgeId && (
        <div className="absolute inset-0 bg-black/30 z-20 flex items-center justify-center">
          <div className="bg-(--bg) border border-(--line) rounded-xl p-5 shadow-xl w-[40rem] flex flex-col gap-3">
            <div className="text-[13px] font-semibold text-(--ink)">Edit condition label</div>
            <textarea
              placeholder="Condition label (e.g. needs revision)"
              value={editLabelValue}
              autoFocus
              rows={4}
              onChange={(e) => setEditLabelValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditLabelEdgeId(null);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmEditLabel();
              }}
              className="w-full text-[12px] bg-(--bg-elev) border border-(--line) rounded px-2 py-1.5 text-(--ink) focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditLabelEdgeId(null)}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEditLabel}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-primary text-white cursor-pointer focus:outline-none hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
