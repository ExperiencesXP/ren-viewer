import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { api, type GraphNode, type StoryGraph } from "../api";
import { EmptyState, ErrorState, LoadingState } from "../components/State";
import { useAsync } from "../hooks";
import { useStudio } from "../studio";

type StationData = {
  label: string;
  kind: string;
  file: string | null;
  entry: boolean;
};

const nodeTypes = { station: StationNode };

function StationNode({ data }: NodeProps) {
  const d = data as StationData;
  return (
    <div className={`station station-${d.kind}${d.entry ? " is-entry" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <span className="disc" />
      <div className="station-copy">
        <div className="station-title">{d.label}</div>
        {d.file ? <div className="station-file">{d.file}</div> : null}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function StoryPage() {
  const { game, onClosed, setPage, setSelectedScript, highlightLabel } = useStudio();
  const graph = useAsync(() => api.graph(), [game.opened_path], onClosed);

  const laidOut = useMemo(() => {
    if (!graph.data) return { nodes: [] as Node[], edges: [] as Edge[] };
    return layoutStory(graph.data);
  }, [graph.data]);

  if (graph.loading) {
    return (
      <div className="page">
        <LoadingState text="Indexing scripts and tracing the map — this can take a while…" />
      </div>
    );
  }
  if (graph.error) {
    return (
      <div className="page">
        <ErrorState error={graph.error} />
      </div>
    );
  }
  const labels = (graph.data?.nodes ?? []).filter((n) => n.kind === "label");
  if (!graph.data || labels.length === 0) {
    return (
      <EmptyState
        title="A silent manuscript"
        body="The index has no labels yet. Decompile must succeed on at least one script before a story map can be drawn."
      />
    );
  }

  return (
    <div className="story-page">
      <div className="story-legend">
        <span>
          <i className="legend-swatch entry" /> entry
        </span>
        <span>
          <i className="legend-swatch jump" /> jump
        </span>
        <span>
          <i className="legend-swatch call" /> call
        </span>
        <span>
          <i className="legend-swatch menu" /> menu
        </span>
        <span className="muted">
          {graph.data.entries.length
            ? `Entries: ${graph.data.entries.join(", ")}`
            : "No engine entry labels found"}
        </span>
      </div>
      <div className="story-flow">
        <ReactFlow
          nodes={
            highlightLabel
              ? laidOut.nodes.map((n) =>
                  n.id === highlightLabel
                    ? { ...n, selected: true }
                    : n,
                )
              : laidOut.nodes
          }
          edges={laidOut.edges}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.05}
          maxZoom={1.6}
          onlyRenderVisibleElements
          onNodeClick={(_, node) => {
            const file = (node.data as StationData).file;
            if (file) {
              setSelectedScript(file);
              setPage("scripts");
            }
          }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        >
          <Background color="#3a322b" gap={28} size={1} />
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(12,11,10,0.7)"
            nodeColor={(n) => ((n.data as StationData).entry ? "#c23a3a" : "#b08d57")}
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

function layoutStory(graph: StoryGraph): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  for (const e of graph.edges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e.target);
    outgoing.set(e.source, list);
  }

  const layer = new Map<string, number>();
  const queue: string[] = [];
  const seeds = (graph.entries.length ? graph.entries : firstIds(graph.nodes)).filter((id) =>
    byId.has(id),
  );
  for (const seed of seeds) {
    if (!layer.has(seed)) {
      layer.set(seed, 0);
      queue.push(seed);
    }
  }
  while (queue.length) {
    const id = queue.shift() as string;
    const depth = layer.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      if (!layer.has(target)) {
        layer.set(target, depth + 1);
        queue.push(target);
      }
    }
  }

  const leftover = graph.nodes.filter((n) => !layer.has(n.id)).map((n) => n.id);
  const colHeight = 14;
  const maxUsed = layer.size ? Math.max(...layer.values()) : -1;
  leftover.forEach((id, i) => {
    layer.set(id, maxUsed + 1 + Math.floor(i / colHeight));
  });

  const columns = new Map<number, string[]>();
  for (const [id, depth] of layer) {
    const col = columns.get(depth) ?? [];
    col.push(id);
    columns.set(depth, col);
  }

  const nodes: Node[] = [];
  for (const [depth, ids] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    ids.forEach((id, i) => {
      const n = byId.get(id);
      if (!n) return;
      const entry = graph.entries.includes(id);
      nodes.push({
        id,
        type: "station",
        position: { x: depth * 250, y: i * 84 + (depth % 2) * 16 },
        data: {
          label: n.label || n.id,
          kind: n.kind,
          file: n.file,
          entry,
        } satisfies StationData,
        className: entry ? "is-entry" : n.kind,
      });
    });
  }

  const edges: Edge[] = graph.edges.map((e, i) => ({
    id: `${e.source}->${e.target}#${i}`,
    source: e.source,
    target: e.target,
    label: e.kind === "menu" || e.text ? clip(e.text, 28) : undefined,
    className: e.kind,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: edgeColor(e.kind) },
    style: { stroke: edgeColor(e.kind) },
  }));

  return { nodes, edges };
}

function firstIds(nodes: GraphNode[]): string[] {
  return nodes.slice(0, 1).map((n) => n.id);
}

function clip(text: string | null, n: number): string | undefined {
  if (!text) return undefined;
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function edgeColor(kind: string): string {
  if (kind === "jump") return "#b08d57";
  if (kind === "call") return "#cbbba3";
  return "#8a7e70";
}
