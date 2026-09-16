"""Story graph from a ScriptIndex. Entry points are engine-generic."""

from __future__ import annotations

from dataclasses import dataclass, field

from ren_viewer.script.index import ScriptIndex

ENTRY_CANDIDATES = ("start", "splashscreen", "main_menu", "before_main_menu")


@dataclass
class GraphNode:
    id: str
    kind: str  # label | menu
    file: str | None = None
    label: str | None = None


@dataclass
class GraphEdge:
    source: str
    target: str
    kind: str  # jump | call | menu | return
    text: str | None = None


@dataclass
class StoryGraph:
    nodes: list[GraphNode] = field(default_factory=list)
    edges: list[GraphEdge] = field(default_factory=list)
    entries: list[str] = field(default_factory=list)


def build_graph(index: ScriptIndex) -> StoryGraph:
    nodes: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = []

    def ensure_label(name: str, file: str | None = None) -> None:
        if name not in nodes:
            nodes[name] = GraphNode(id=name, kind="label", file=file, label=name)

    for label in index.labels.values():
        ensure_label(label.name, label.file)
        for target in label.jumps:
            ensure_label(target)
            edges.append(GraphEdge(label.name, target, "jump"))
        for target in label.calls:
            ensure_label(target)
            edges.append(GraphEdge(label.name, target, "call"))
        for i, choice in enumerate(label.menus):
            menu_id = f"{label.name}::menu{i}"
            nodes[menu_id] = GraphNode(id=menu_id, kind="menu", file=label.file, label=choice.text)
            edges.append(GraphEdge(label.name, menu_id, "menu", text=choice.text))
            if choice.target:
                ensure_label(choice.target)
                edges.append(GraphEdge(menu_id, choice.target, "jump", text=choice.text))

    entries = [name for name in ENTRY_CANDIDATES if name in index.labels]
    return StoryGraph(nodes=list(nodes.values()), edges=edges, entries=entries)
