"""Graph Engine — in-memory graph operations, impact radius calculation, and layout."""

from __future__ import annotations

import uuid
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field

import networkx as nx


@dataclass
class InternalNode:
    """Internal representation of a graph node."""
    id: str
    label: str
    type: str  # domain, infrastructure, shared, external
    responsibility: str = ""
    language: str = "typescript"
    lines: int = 0
    complexity: str = "medium"
    verified: bool = False
    status: str = "active"
    health_score: float = 0.0
    risk_count: int = 0
    test_coverage: float = 0.0
    x: float = 0.0
    y: float = 0.0


@dataclass
class InternalEdge:
    """Internal representation of a graph edge."""
    id: str
    source: str
    target: str
    type: str = "depends_on"
    label: str = ""
    weight: int = 1
    required: bool = True


class GraphEngine:
    """In-memory graph engine using NetworkX for graph operations."""

    def __init__(self):
        # project_id -> nx.DiGraph mapping
        self._graphs: Dict[str, nx.DiGraph] = {}
        # project_id -> {node_id: InternalNode}
        self._nodes: Dict[str, Dict[str, InternalNode]] = {}
        # project_id -> {edge_id: InternalEdge}
        self._edges: Dict[str, Dict[str, InternalEdge]] = {}

    def initialize(self):
        """Initialize the graph engine."""
        pass  # No-op for now; will be populated on project load

    def load_graph(self, project_id: str, graph_data: dict):
        """Load graph data from a project analysis result."""
        G = nx.DiGraph()

        nodes_data = graph_data.get("nodes", [])
        edges_data = graph_data.get("edges", [])

        self._nodes[project_id] = {}
        self._edges[project_id] = {}

        for n in nodes_data:
            node = InternalNode(
                id=n["id"],
                label=n.get("label", n["id"]),
                type=n.get("type", "domain"),
                responsibility=n.get("responsibility", ""),
                language=n.get("language", "typescript"),
                lines=n.get("lines", 0),
                complexity=n.get("complexity", "medium"),
                verified=n.get("verified", False),
                status=n.get("status", "active"),
                health_score=n.get("health_score", 0.0),
                risk_count=n.get("risk_count", 0),
                test_coverage=n.get("test_coverage", 0.0),
            )
            self._nodes[project_id][node.id] = node
            G.add_node(node.id, **{
                "label": node.label,
                "type": node.type,
                "responsibility": node.responsibility,
                "lines": node.lines,
                "verified": node.verified,
                "status": node.status,
            })

        for e in edges_data:
            edge = InternalEdge(
                id=e.get("id", f"{e['source']}-{e['target']}-{e.get('type', 'depends_on')}"),
                source=e["source"],
                target=e["target"],
                type=e.get("type", "depends_on"),
                label=e.get("label", ""),
                weight=e.get("weight", 1),
                required=e.get("required", True),
            )
            self._edges[project_id][edge.id] = edge
            G.add_edge(edge.source, edge.target, **{
                "type": edge.type,
                "label": edge.label,
                "weight": edge.weight,
                "required": edge.required,
            })

        self._graphs[project_id] = G
        self._compute_layout(project_id)

    def get_graph_data(self, project_id: str) -> Optional[dict]:
        """Get graph data in a format suitable for the frontend."""
        if project_id not in self._graphs:
            return None
        return {
            "nodes": [
                {
                    "id": n.id,
                    "label": n.label,
                    "type": n.type,
                    "responsibility": n.responsibility,
                    "language": n.language,
                    "lines": n.lines,
                    "complexity": n.complexity,
                    "verified": n.verified,
                    "status": n.status,
                    "health_score": n.health_score,
                    "risk_count": n.risk_count,
                    "test_coverage": n.test_coverage,
                    "x": n.x,
                    "y": n.y,
                }
                for n in self._nodes[project_id].values()
            ],
            "edges": [
                {
                    "id": e.id,
                    "source": e.source,
                    "target": e.target,
                    "type": e.type,
                    "label": e.label,
                    "weight": e.weight,
                    "required": e.required,
                }
                for e in self._edges[project_id].values()
            ],
        }

    def get_unverified_count(self, project_id: str) -> int:
        """Get the count of unverified cognition nodes."""
        if project_id not in self._nodes:
            return 0
        return sum(1 for n in self._nodes[project_id].values() if n.status == "pending_review")

    def calculate_impact_radius(self, node_id: str, depth: int = 3) -> Optional[dict]:
        """Calculate impact radius — find all downstream nodes affected by changes to this node."""
        # Find which project this node belongs to
        project_id = None
        for pid, nodes in self._nodes.items():
            if node_id in nodes:
                project_id = pid
                break

        if project_id is None or project_id not in self._graphs:
            return None

        G = self._graphs[project_id]
        if node_id not in G:
            return None

        # Find downstream nodes (nodes that depend on this node, directly or transitively)
        direct = []
        indirect = []

        try:
            # Successors are nodes this node points to (depends_on)
            # But for impact radius, we want nodes that depend ON this node
            # i.e., predecessors in the dependency graph
            # Wait — our edges are: Module-A -[:DEPENDS_ON]-> Module-B
            # So if we change Module-B, all modules with edges pointing TO B are affected
            # That means we need to find all nodes that have an edge TO this node
            # In NetworkX terms, we want predecessors() for "affected by change to this node"

            # Actually, re-evaluating: the impact of changing node_id
            # propagates to all nodes that DEPEND on node_id
            # Edge direction: source DEPENDS_ON target
            # So if we change target, source is impacted
            # We need reverse: all nodes that have this node_id as target
            # In DiGraph, that's predecessors(node_id) for direct impact
            # And nx.ancestors would give us the wrong direction

            # Impact radius: all nodes that DEPEND on node_id (either directly or transitively)
            # In our graph, edge = "source depends on target"
            # So predecessors(node_id) = nodes that point to node_id = dependents = direct impact
            for pred in G.predecessors(node_id):
                pred_node = self._nodes[project_id].get(pred)
                if pred_node:
                    direct.append({
                        "node_id": pred,
                        "node_label": pred_node.label,
                        "reason": f"depends on {node_id}",
                        "distance": 1,
                    })

            # For indirect impact, we need to find all nodes that depend on the direct dependents
            # (2nd, 3rd... order impact)
            # BFS through predecessors
            visited = {node_id}
            queue = list(G.predecessors(node_id))
            distance_map = {}

            for n in queue:
                distance_map[n] = 1
                visited.add(n)

            for _ in range(depth - 1):
                next_queue = []
                for n in queue:
                    for pred in G.predecessors(n):
                        if pred not in visited:
                            next_queue.append(pred)
                            distance_map[pred] = distance_map[n] + 1
                            visited.add(pred)
                            pred_node = self._nodes[project_id].get(pred)
                            if pred_node:
                                indirect.append({
                                    "node_id": pred,
                                    "node_label": pred_node.label,
                                    "reason": f"indirectly impacted through {n}",
                                    "distance": distance_map[pred],
                                })
                queue = next_queue

        except nx.NetworkXError:
            pass

        # Also find successors (what this node depends on) as "upstream impact"
        cognition_updates = [f"{node_id}.cognition.yaml"]

        return {
            "center_node_id": node_id,
            "direct": direct,
            "indirect": indirect,
            "cognition_updates": cognition_updates,
        }

    def add_node(self, project_id: str, node_data: dict):
        """Add or update a node in the graph."""
        if project_id not in self._graphs:
            self._graphs[project_id] = nx.DiGraph()
            self._nodes[project_id] = {}
            self._edges[project_id] = {}

        node = InternalNode(
            id=node_data["id"],
            label=node_data.get("label", node_data["id"]),
            type=node_data.get("type", "domain"),
            responsibility=node_data.get("responsibility", ""),
            language=node_data.get("language", "typescript"),
            lines=node_data.get("lines", 0),
        )
        self._nodes[project_id][node.id] = node
        self._graphs[project_id].add_node(node.id, label=node.label, type=node.type, responsibility=node.responsibility)

    def add_edge(self, project_id: str, edge_data: dict):
        """Add an edge to the graph."""
        if project_id not in self._graphs:
            return

        edge = InternalEdge(
            id=edge_data.get("id", f"{edge_data['source']}-{edge_data['target']}-depends_on"),
            source=edge_data["source"],
            target=edge_data["target"],
            type=edge_data.get("type", "depends_on"),
            label=edge_data.get("label", ""),
            weight=edge_data.get("weight", 1),
            required=edge_data.get("required", True),
        )
        self._edges[project_id][edge.id] = edge
        self._graphs[project_id].add_edge(edge.source, edge.target, type=edge.type, label=edge.label, weight=edge.weight)

    def update_node_status(self, project_id: str, node_id: str, status: str):
        """Update the status of a node (active, pending_review, analyzing, error)."""
        if project_id in self._nodes and node_id in self._nodes[project_id]:
            self._nodes[project_id][node_id].status = status

    def _compute_layout(self, project_id: str):
        """Compute force-directed layout positions for nodes."""
        if project_id not in self._graphs:
            return

        G = self._graphs[project_id]
        if len(G.nodes) == 0:
            return

        # Use spring layout as default positions
        try:
            pos = nx.spring_layout(G, k=2.0, iterations=50, seed=42)
            for node_id, (x, y) in pos.items():
                if node_id in self._nodes[project_id]:
                    self._nodes[project_id][node_id].x = float(x) * 500
                    self._nodes[project_id][node_id].y = float(y) * 500
        except Exception:
            # Fallback: grid layout
            nodes = list(G.nodes)
            cols = int(len(nodes) ** 0.5) + 1
            for i, node_id in enumerate(nodes):
                if node_id in self._nodes[project_id]:
                    self._nodes[project_id][node_id].x = float((i % cols) * 200)
                    self._nodes[project_id][node_id].y = float((i // cols) * 200)

    def find_cycles(self, project_id: str) -> List[List[str]]:
        """Find dependency cycles in the graph."""
        if project_id not in self._graphs:
            return []
        G = self._graphs[project_id]
        try:
            cycles = list(nx.simple_cycles(G))
            return cycles
        except Exception:
            return []

    def get_node_dependencies(self, project_id: str, node_id: str) -> Dict:
        """Get all dependencies and dependents for a node."""
        if project_id not in self._graphs or node_id not in self._graphs[project_id]:
            return {"dependencies": [], "dependents": []}

        G = self._graphs[project_id]
        dependencies = [{"id": n, "label": self._nodes[project_id].get(n, InternalNode(id=n, label=n, type="domain")).label} for n in G.successors(node_id)]
        dependents = [{"id": n, "label": self._nodes[project_id].get(n, InternalNode(id=n, label=n, type="domain")).label} for n in G.predecessors(node_id)]

        return {"dependencies": dependencies, "dependents": dependents}

    def get_node_count(self, project_id: str) -> int:
        """Return the number of nodes in a project's graph."""
        if project_id not in self._nodes:
            return 0
        return len(self._nodes[project_id])

    def get_edge_count(self, project_id: str) -> int:
        """Return the number of edges in a project's graph."""
        if project_id not in self._edges:
            return 0
        return len(self._edges[project_id])

    def update_node_property(self, project_id: str, node_id: str, prop: str, value):
        """Update a single property on an internal node."""
        if project_id in self._nodes and node_id in self._nodes[project_id]:
            node = self._nodes[project_id][node_id]
            if hasattr(node, prop):
                setattr(node, prop, value)
                if project_id in self._graphs and node_id in self._graphs[project_id]:
                    self._graphs[project_id].nodes[node_id][prop] = value
                return True
        return False

    def remove_node(self, project_id: str, node_id: str) -> bool:
        """Remove a node and all its connected edges from the graph."""
        if project_id not in self._nodes or node_id not in self._nodes[project_id]:
            return False

        # Remove from internal maps
        del self._nodes[project_id][node_id]

        # Remove associated edges
        edges_to_remove = [
            eid for eid, edge in self._edges.get(project_id, {}).items()
            if edge.source == node_id or edge.target == node_id
        ]
        for eid in edges_to_remove:
            del self._edges[project_id][eid]

        # Remove from NetworkX graph
        if project_id in self._graphs and node_id in self._graphs[project_id]:
            self._graphs[project_id].remove_node(node_id)

        return True


# Singleton instance
graph_engine = GraphEngine()