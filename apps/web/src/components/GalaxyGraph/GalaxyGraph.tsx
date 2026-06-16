import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { useGraphStore } from '../../stores/graphStore';

// ---- Visual constants ----
const TYPE_COLORS: Record<string, string> = {
  domain: '#3377ff',
  infrastructure: '#22c55e',
  shared: '#eab308',
  external: '#6b7280',
};

const STATUS_GLOW: Record<string, string> = {
  pending_review: '#f97316',
  analyzing: '#3377ff',
  error: '#ef4444',
};

const EDGE_COLORS: Record<string, string> = {
  api_call: '#4a6fa5',
  data_flow: '#7c5cbf',
  event_subscription: '#e07c24',
  shared_type: '#5a8a5e',
  inherits: '#c0564b',
};

const GalaxyGraph: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const minimapRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<any, any> | null>(null);

  const {
    nodes, edges, selectedNodeId, hoveredNodeId,
    selectNode, hoverNode, setZoom,
    showDomain, showInfra, showShared, showExternal,
    showEdgeLabels, showMiniMap,
    toggleLayer,
  } = useGraphStore();

  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [forceStrength, setForceStrength] = useState(-400);
  const [linkDistance, setLinkDistance] = useState(120);

  // Visible nodes/edges filtered by layer toggles
  const visibleTypes = new Set<string>();
  if (showDomain) visibleTypes.add('domain');
  if (showInfra) visibleTypes.add('infrastructure');
  if (showShared) visibleTypes.add('shared');
  if (showExternal) visibleTypes.add('external');

  const visibleNodes = nodes.filter((n) => visibleTypes.has(n.type));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

  // ---- Main D3 rendering effect ----
  useEffect(() => {
    if (!svgRef.current || visibleNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = containerRef.current?.clientWidth || 800;
    const height = containerRef.current?.clientHeight || 600;

    svg.selectAll('*').remove();

    // Defs: arrow markers, glow filters, gradient patterns
    const defs = svg.append('defs');

    // Arrow marker
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#2a3a5c');

    // Glow filter for selected nodes
    const glowFilter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Pulse animation filter for pending_review
    const pulseFilter = defs.append('filter')
      .attr('id', 'pulse-glow')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    pulseFilter.append('feGaussianBlur')
      .attr('stdDeviation', '6')
      .attr('result', 'blur');
    pulseFilter.append('feComposite')
      .attr('in', 'SourceGraphic')
      .attr('in2', 'blur')
      .attr('operator', 'over');

    // Zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        setZoom(event.transform.k);
        updateMinimap(event.transform);
      });

    svg.call(zoomBehavior);

    // Main group
    const g = svg.append('g');
    const centerX = width / 2;
    const centerY = height / 2;

    // Prepare D3 data
    const d3Nodes = visibleNodes.map((n) => ({
      ...n,
      x: (n.x || 0) + centerX,
      y: (n.y || 0) + centerY,
    }));

    const d3Links = visibleEdges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      weight: e.weight || 1,
      label: e.label || '',
    }));

    // Create simulation
    const simulation = d3.forceSimulation(d3Nodes as any)
      .force('link', d3.forceLink(d3Links as any).id((d: any) => d.id).distance(linkDistance).strength(0.5))
      .force('charge', d3.forceManyBody().strength(forceStrength))
      .force('center', d3.forceCenter(centerX, centerY))
      .force('collision', d3.forceCollide().radius(60))
      .force('x', d3.forceX(centerX).strength(0.04))
      .force('y', d3.forceY(centerY).strength(0.04));

    simulationRef.current = simulation;

    // ---- Draw edges ----
    const linkGroup = g.append('g').attr('class', 'edges');

    const link = linkGroup.selectAll('g')
      .data(d3Links)
      .join('g')
      .attr('class', 'edge-group');

    // Edge line
    link.append('line')
      .attr('stroke', (d: any) => EDGE_COLORS[d.type] || '#2a3a5c')
      .attr('stroke-width', (d: any) => Math.max(1, Math.min(4, d.weight)))
      .attr('stroke-dasharray', (d: any) =>
        d.type === 'event_subscription' ? '5,5' :
        d.type === 'data_flow' ? '3,3' : 'none')
      .attr('marker-end', 'url(#arrowhead)')
      .attr('opacity', 0.6);

    // Edge label (optional)
    if (showEdgeLabels) {
      link.append('text')
        .attr('class', 'edge-label')
        .attr('dy', -4)
        .attr('text-anchor', 'middle')
        .attr('fill', '#5a6a8a')
        .attr('font-size', '8px')
        .text((d: any) => d.label || d.type);
    }

    // ---- Draw nodes ----
    const nodeGroup = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(d3Nodes)
      .join('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      // Drag behavior (typed as any to avoid D3 strict generic issues)
      .call((() => {
        const drag = d3.drag<any, any>()
          .on('start', (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event: any, d: any) => {
            d.fx = event.x; d.fy = event.y;
          })
          .on('end', (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          });
        return drag;
      })() as any);

    // Build each node visual
    nodeGroup.each(function (d: any) {
      const el = d3.select(this);
      const color = TYPE_COLORS[d.type] || '#6b7280';
      const isSelected = d.id === selectedNodeId;
      const isHovered = d.id === hoveredNodeId;
      const nodeWidth = Math.max(90, Math.min(150, d.label.length * 11 + 40));
      const nodeHeight = 40;

      // Status glow / pulse ring
      if (d.status === 'pending_review' || d.status === 'analyzing') {
        const glowColor = STATUS_GLOW[d.status] || '#3377ff';
        el.append('ellipse')
          .attr('rx', nodeWidth / 2 + 10)
          .attr('ry', nodeHeight / 2 + 10)
          .attr('fill', 'none')
          .attr('stroke', glowColor)
          .attr('stroke-width', 2)
          .attr('opacity', 0.4)
          .attr('class', d.status === 'pending_review' ? 'node-pulse' : 'node-breathe');
      }

      // Selected highlight ring
      if (isSelected) {
        el.append('rect')
          .attr('x', -nodeWidth / 2 - 4)
          .attr('y', -nodeHeight / 2 - 4)
          .attr('width', nodeWidth + 8)
          .attr('height', nodeHeight + 8)
          .attr('rx', 10)
          .attr('ry', 10)
          .attr('fill', 'none')
          .attr('stroke', '#cognition-500')
          .attr('stroke-width', 2)
          .attr('filter', 'url(#glow)')
          .attr('opacity', 0.8);
      }

      // Main shape
      if (d.type === 'external') {
        el.append('ellipse')
          .attr('rx', nodeWidth / 2)
          .attr('ry', nodeHeight / 2)
          .attr('fill', '#1a1a2e')
          .attr('stroke', color)
          .attr('stroke-width', isSelected ? 2.5 : isHovered ? 2 : 1.5)
          .attr('opacity', 0.92);
      } else {
        el.append('rect')
          .attr('x', -nodeWidth / 2)
          .attr('y', -nodeHeight / 2)
          .attr('width', nodeWidth)
          .attr('height', nodeHeight)
          .attr('rx', 8)
          .attr('ry', 8)
          .attr('fill', '#1a1a2e')
          .attr('stroke', color)
          .attr('stroke-width', isSelected ? 2.5 : isHovered ? 2 : 1.5)
          .attr('opacity', 0.92);
      }

      // Health bar (bottom of node)
      const healthScore = d.health_score || 0;
      if (healthScore > 0) {
        const barWidth = nodeWidth - 12;
        const barY = nodeHeight / 2 - 6;
        el.append('rect')
          .attr('x', -barWidth / 2)
          .attr('y', barY)
          .attr('width', barWidth)
          .attr('height', 3)
          .attr('rx', 1.5)
          .attr('fill', '#0f172a');
        el.append('rect')
          .attr('x', -barWidth / 2)
          .attr('y', barY)
          .attr('width', barWidth * healthScore / 100)
          .attr('height', 3)
          .attr('rx', 1.5)
          .attr('fill', healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#eab308' : '#ef4444');
      }

      // Type indicator dot
      el.append('circle')
        .attr('cx', -nodeWidth / 2 + 14)
        .attr('cy', 0)
        .attr('r', 4)
        .attr('fill', color)
        .attr('opacity', 0.9);

      // Label text
      el.append('text')
        .attr('x', 4)
        .attr('y', d.type === 'external' ? 4 : -2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e2e8f0')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .text(d.label.length > 16 ? d.label.slice(0, 14) + '…' : d.label);

      // Lines count
      if (d.lines) {
        el.append('text')
          .attr('x', 4)
          .attr('y', 10)
          .attr('text-anchor', 'middle')
          .attr('fill', '#4a5568')
          .attr('font-size', '8px')
          .text(`${d.lines} lines`);
      }

      // Verified badge
      if (d.verified || d.human_verified) {
        el.append('text')
          .attr('x', nodeWidth / 2 - 10)
          .attr('y', -nodeHeight / 2 + 12)
          .attr('fill', '#22c55e')
          .attr('font-size', '9px')
          .text('✓');
      }
    });

    // ---- Node interactions ----
    nodeGroup
      .on('mouseover', (event: any, d: any) => {
        hoverNode(d.id);
        d3.select(event.currentTarget).raise();
        const tooltip = d3.select('#graph-tooltip');
        tooltip
          .style('display', 'block')
          .style('left', (event.pageX + 12) + 'px')
          .style('top', (event.pageY - 12) + 'px')
          .html(`
            <div class="font-medium text-[#a78bfa]">${d.label}</div>
            <div class="text-[10px] text-gray-400 mt-1 max-w-[200px]">${d.responsibility || ''}</div>
            <div class="text-[10px] text-gray-500 mt-1">Type: ${d.type} | Lines: ${d.lines || '-'} | Health: ${d.health_score || '-'}%</div>
          `);
      })
      .on('mouseout', () => {
        hoverNode(null);
        d3.select('#graph-tooltip').style('display', 'none');
      })
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        selectNode(d.id);
      })
      .on('dblclick', (event: any, d: any) => {
        event.stopPropagation();
        import('../../stores/cognitionStore').then(({ useCognitionStore }) => {
          useCognitionStore.getState().loadImpactRadius(d.id);
        });
      });

    // ---- Simulation tick ----
    simulation.on('tick', () => {
      link.select('line')
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      if (showEdgeLabels) {
        link.select('text')
          .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
          .attr('y', (d: any) => (d.source.y + d.target.y) / 2);
      }

      nodeGroup.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // ---- CSS Animations via <style> ----
    svg.append('style').text(`
      @keyframes pulse {
        0%, 100% { opacity: 0.2; stroke-width: 1; }
        50% { opacity: 0.7; stroke-width: 3; }
      }
      @keyframes breathe {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.6; }
      }
      .node-pulse { animation: pulse 2s ease-in-out infinite; }
      .node-breathe { animation: breathe 3s ease-in-out infinite; }
    `);

    // ---- Minimap update function ----
    const updateMinimap = (transform?: d3.ZoomTransform) => {
      if (!minimapRef.current) return;
      const ms = d3.select(minimapRef.current);
      ms.selectAll('*').remove();

      const mw = 150, mh = 100;
      const scaleX = mw / width;
      const scaleY = mh / height;

      // Mini viewport rectangle
      if (transform) {
        const vx = -transform.x / transform.k * scaleX;
        const vy = -transform.y / transform.k * scaleY;
        const vw = width / transform.k * scaleX;
        const vh = height / transform.k * scaleY;
        ms.append('rect')
          .attr('x', vx).attr('y', vy)
          .attr('width', Math.min(vw, mw)).attr('height', Math.min(vh, mh))
          .attr('fill', 'none')
          .attr('stroke', '#a78bfa')
          .attr('stroke-width', 0.8)
          .attr('opacity', 0.6);
      }

      // Mini edges
      d3Links.forEach((link: any) => {
        const src = typeof link.source === 'object' ? link.source : d3Nodes.find(n => n.id === link.source);
        const tgt = typeof link.target === 'object' ? link.target : d3Nodes.find(n => n.id === link.target);
        if (src && tgt) {
          ms.append('line')
            .attr('x1', ((src.x || 0) * scaleX))
            .attr('y1', ((src.y || 0) * scaleY))
            .attr('x2', ((tgt.x || 0) * scaleX))
            .attr('y2', ((tgt.y || 0) * scaleY))
            .attr('stroke', '#2a3a5c')
            .attr('stroke-width', 0.3);
        }
      });

      // Mini nodes
      d3Nodes.forEach((n: any) => {
        ms.append('circle')
          .attr('cx', (n.x || 0) * scaleX)
          .attr('cy', (n.y || 0) * scaleY)
          .attr('r', 2)
          .attr('fill', TYPE_COLORS[n.type] || '#6b7280')
          .attr('opacity', n.id === selectedNodeId ? 1 : 0.6);
      });
    };

    // Initial minimap render after simulation settles
    simulation.on('end', () => {
      updateMinimap(d3.zoomTransform(svgRef.current!));
    });

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [visibleNodes, visibleEdges, selectedNodeId, hoveredNodeId, showEdgeLabels, forceStrength, linkDistance]);

  // Click empty space to deselect
  const handleCanvasClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div ref={containerRef} className="h-full w-full relative graph-canvas bg-[#0a0e1a]">
      {/* Main SVG canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        onClick={handleCanvasClick}
      />

      {/* Tooltip */}
      <div
        id="graph-tooltip"
        className="hidden absolute z-50 px-3 py-2 bg-[#0f1729]/95 border border-gray-700 rounded-lg shadow-xl text-xs pointer-events-none max-w-[240px] backdrop-blur-sm"
      />

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
        <button
          onClick={() => {
            const svg: any = d3.select(svgRef.current);
            svg.transition().duration(300).call(d3.zoom<any, any>().scaleBy, 1.3);
          }}
          className="w-8 h-8 bg-[#111827]/90 border border-gray-700 rounded text-gray-400 hover:text-white hover:bg-gray-800 flex items-center justify-center text-sm transition-colors"
          title="放大"
        >+</button>
        <button
          onClick={() => {
            const svg: any = d3.select(svgRef.current);
            svg.transition().duration(300).call(d3.zoom<any, any>().scaleBy, 0.7);
          }}
          className="w-8 h-8 bg-[#111827]/90 border border-gray-700 rounded text-gray-400 hover:text-white hover:bg-gray-800 flex items-center justify-center text-sm transition-colors"
          title="缩小"
        >−</button>
        <button
          onClick={() => {
            const svg: any = d3.select(svgRef.current);
            svg.transition().duration(500).call(d3.zoom<any, any>().transform, d3.zoomIdentity);
          }}
          className="w-8 h-8 bg-[#111827]/90 border border-gray-700 rounded text-gray-400 hover:text-white hover:bg-gray-800 flex items-center justify-center text-[10px] transition-colors"
          title="重置视图"
        >1:1</button>
        <button
          onClick={() => setShowLayerPanel(!showLayerPanel)}
          className="w-8 h-8 bg-[#111827]/90 border border-gray-700 rounded text-gray-400 hover:text-white hover:bg-gray-800 flex items-center justify-center text-xs transition-colors"
          title="图层控制"
        >☰</button>
      </div>

      {/* Layer control panel */}
      {showLayerPanel && (
        <div className="absolute top-3 right-12 z-20 w-48 bg-[#111827]/95 border border-gray-700 rounded-lg p-3 text-xs backdrop-blur-sm">
          <div className="font-medium text-gray-300 mb-2">图层控制</div>
          {([
            ['showDomain', '🏢 业务模块', 'domain'],
            ['showInfra', '🔧 基础设施', 'infrastructure'],
            ['showShared', '📦 共享模块', 'shared'],
            ['showExternal', '🔗 外部依赖', 'external'],
          ] as const).map(([key, label, type]) => (
            <label key={key} className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={useGraphStore.getState()[key]}
                onChange={() => toggleLayer(key)}
                className="accent-[#a78bfa]"
              />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] }} />
              <span className="text-gray-400">{label}</span>
            </label>
          ))}
          <div className="border-t border-gray-700 mt-2 pt-2">
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showEdgeLabels}
                onChange={() => toggleLayer('showEdgeLabels')}
                className="accent-[#a78bfa]"
              />
              <span className="text-gray-400">显示边标签</span>
            </label>
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showMiniMap}
                onChange={() => toggleLayer('showMiniMap')}
                className="accent-[#a78bfa]"
              />
              <span className="text-gray-400">迷你地图</span>
            </label>
          </div>
          <div className="border-t border-gray-700 mt-2 pt-2 space-y-2">
            <div>
              <label className="text-gray-500 block mb-1">斥力强度: {forceStrength}</label>
              <input
                type="range"
                min={-1000} max={-100} step={50}
                value={forceStrength}
                onChange={(e) => setForceStrength(Number(e.target.value))}
                className="w-full accent-[#a78bfa]"
              />
            </div>
            <div>
              <label className="text-gray-500 block mb-1">连线距离: {linkDistance}</label>
              <input
                type="range"
                min={60} max={300} step={10}
                value={linkDistance}
                onChange={(e) => setLinkDistance(Number(e.target.value))}
                className="w-full accent-[#a78bfa]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Minimap */}
      {showMiniMap && (
        <div className="absolute bottom-3 right-3 z-10">
          <div className="w-[150px] h-[100px] bg-[#111827]/90 border border-gray-700 rounded-lg overflow-hidden backdrop-blur-sm">
            <div className="text-[7px] text-gray-500 px-1 pt-0.5 flex items-center justify-between">
              <span>导航</span>
              <span>{visibleNodes.length} 节点</span>
            </div>
            <svg
              ref={minimapRef}
              className="w-full"
              style={{ height: '88px' }}
              viewBox="0 0 150 100"
            />
          </div>
        </div>
      )}

      {/* Node count badge */}
      <div className="absolute top-3 left-3 z-10 bg-[#111827]/90 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-400 backdrop-blur-sm">
        {visibleNodes.length} 节点 · {visibleEdges.length} 边
        {selectedNodeId && (
          <span className="ml-2 text-[#a78bfa]">▸ {selectedNodeId}</span>
        )}
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-5xl mb-4">🌌</div>
            <h2 className="text-lg font-medium text-gray-300">星系图谱</h2>
            <p className="text-sm mt-2">加载项目后，认知图谱将在此显示</p>
            <p className="text-xs mt-1 text-gray-600">拖拽节点 · 点击选中 · 双击查看影响 · 滚轮缩放</p>
          </div>
        </div>
      )}

      {/* Interaction hints */}
      {nodes.length > 0 && !selectedNodeId && (
        <div className="absolute bottom-3 left-3 z-10 text-[10px] text-gray-600">
          点击选中节点 · 双击查看影响半径 · 拖拽移动 · 滚轮缩放
        </div>
      )}
    </div>
  );
};

export default GalaxyGraph;
