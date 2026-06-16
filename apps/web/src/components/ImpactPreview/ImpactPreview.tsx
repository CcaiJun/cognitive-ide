import React, { useRef, useEffect } from 'react';
import { useCognitionStore } from '../../stores/cognitionStore';
import { useGraphStore } from '../../stores/graphStore';
import type { ImpactNode } from '@cognition-ide/shared-types';

const TYPE_COLORS: Record<string, string> = {
  domain: '#3377ff',
  infrastructure: '#22c55e',
  shared: '#eab308',
  external: '#6b7280',
};

const ImpactPreview: React.FC = () => {
  const { impactRadius, showImpactPreview, setShowImpactPreview } = useCognitionStore();
  const { nodes } = useGraphStore();
  const svgRef = useRef<SVGSVGElement>(null);

  const directImpacts: ImpactNode[] = impactRadius?.direct || [];
  const indirectImpacts: ImpactNode[] = impactRadius?.indirect || [];
  const centerId = impactRadius?.center_node_id || '';

  // Build a small radial impact visualization
  useEffect(() => {
    if (!svgRef.current || !impactRadius) return;

    const svg = svgRef.current;
    const cx = 120, cy = 80;
    const directRadius = 45;
    const indirectRadius = 70;

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const ns = 'http://www.w3.org/2000/svg';

    // Indirect ring (background)
    const indirectRing = document.createElementNS(ns, 'circle');
    indirectRing.setAttribute('cx', String(cx));
    indirectRing.setAttribute('cy', String(cy));
    indirectRing.setAttribute('r', String(indirectRadius));
    indirectRing.setAttribute('fill', 'none');
    indirectRing.setAttribute('stroke', '#f97316');
    indirectRing.setAttribute('stroke-width', '0.5');
    indirectRing.setAttribute('stroke-dasharray', '3,3');
    indirectRing.setAttribute('opacity', '0.3');
    svg.appendChild(indirectRing);

    // Direct ring (background)
    const directRing = document.createElementNS(ns, 'circle');
    directRing.setAttribute('cx', String(cx));
    directRing.setAttribute('cy', String(cy));
    directRing.setAttribute('r', String(directRadius));
    directRing.setAttribute('fill', 'none');
    directRing.setAttribute('stroke', '#ef4444');
    directRing.setAttribute('stroke-width', '0.8');
    directRing.setAttribute('opacity', '0.3');
    svg.appendChild(directRing);

    // Indirect nodes
    indirectImpacts.forEach((item, i) => {
      const angle = (2 * Math.PI * i) / Math.max(indirectImpacts.length, 1) - Math.PI / 2;
      const x = cx + indirectRadius * Math.cos(angle);
      const y = cy + indirectRadius * Math.sin(angle);

      // Line to center
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(cx));
      line.setAttribute('y1', String(cy));
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#f97316');
      line.setAttribute('stroke-width', '0.5');
      line.setAttribute('stroke-dasharray', '2,2');
      line.setAttribute('opacity', '0.3');
      svg.appendChild(line);

      // Node
      const circle = document.createElementNS(ns, 'circle');
      const matchNode = nodes.find(n => n.id === item.node_id);
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', TYPE_COLORS[matchNode?.type || 'domain'] || '#6b7280');
      circle.setAttribute('opacity', '0.7');
      svg.appendChild(circle);

      // Label
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y - 7));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#9ca3af');
      text.setAttribute('font-size', '6');
      text.textContent = item.node_label.length > 8 ? item.node_label.slice(0, 7) + '…' : item.node_label;
      svg.appendChild(text);
    });

    // Direct nodes
    directImpacts.forEach((item, i) => {
      const angle = (2 * Math.PI * i) / Math.max(directImpacts.length, 1) - Math.PI / 2;
      const x = cx + directRadius * Math.cos(angle);
      const y = cy + directRadius * Math.sin(angle);

      // Line to center
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(cx));
      line.setAttribute('y1', String(cy));
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', '#ef4444');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('opacity', '0.5');
      svg.appendChild(line);

      // Node
      const circle = document.createElementNS(ns, 'circle');
      const matchNode = nodes.find(n => n.id === item.node_id);
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', TYPE_COLORS[matchNode?.type || 'domain'] || '#6b7280');
      circle.setAttribute('opacity', '0.9');
      svg.appendChild(circle);

      // Label
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y - 9));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#d1d5db');
      text.setAttribute('font-size', '7');
      text.textContent = item.node_label.length > 10 ? item.node_label.slice(0, 9) + '…' : item.node_label;
      svg.appendChild(text);
    });

    // Center node
    const center = document.createElementNS(ns, 'circle');
    center.setAttribute('cx', String(cx));
    center.setAttribute('cy', String(cy));
    center.setAttribute('r', '8');
    center.setAttribute('fill', '#eab308');
    center.setAttribute('opacity', '0.9');
    svg.appendChild(center);

    // Center label
    const centerText = document.createElementNS(ns, 'text');
    centerText.setAttribute('x', String(cx));
    centerText.setAttribute('y', String(cy + 16));
    centerText.setAttribute('text-anchor', 'middle');
    centerText.setAttribute('fill', '#fbbf24');
    centerText.setAttribute('font-size', '8');
    centerText.setAttribute('font-weight', 'bold');
    centerText.textContent = centerId.length > 12 ? centerId.slice(0, 11) + '…' : centerId;
    svg.appendChild(centerText);

  }, [impactRadius, nodes, centerId, directImpacts, indirectImpacts]);

  if (!showImpactPreview || !impactRadius) {
    return (
      <div className="text-center text-gray-500 text-sm py-8">
        <div className="text-3xl mb-2">🔴</div>
        <p>选择模块并查看影响半径</p>
        <p className="text-xs mt-1">双击图谱节点查看影响范围</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          影响半径预览
        </h3>
        <button
          onClick={() => setShowImpactPreview(false)}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          ✕ 关闭
        </button>
      </div>

      {/* Center node */}
      <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <div className="text-xs font-medium text-yellow-400">
          🎯 修改目标: {centerId}
        </div>
      </div>

      {/* Visual impact graph */}
      <div className="bg-[#0a0e1a] rounded-lg border border-gray-800 overflow-hidden">
        <svg
          ref={svgRef}
          className="w-full"
          viewBox="0 0 240 160"
          style={{ minHeight: '120px' }}
        />
        <div className="flex items-center justify-center gap-4 py-1 text-[8px] text-gray-600">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> 修改目标
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 直接影响
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> 间接影响
          </span>
        </div>
      </div>

      {/* Direct impact list */}
      {directImpacts.length > 0 && (
        <div>
          <div className="text-xs text-gray-300 font-medium mb-1.5">
            直接影响 ({directImpacts.length})
          </div>
          <div className="space-y-1">
            {directImpacts.map((item, i) => {
              const matchNode = nodes.find(n => n.id === item.node_id);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 bg-red-500/5 border border-red-500/20 rounded cursor-pointer hover:bg-red-500/10 transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[matchNode?.type || 'domain'] || '#6b7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-200 font-medium">{item.node_label}</div>
                    <div className="text-[10px] text-gray-500 truncate">{item.reason}</div>
                  </div>
                  <span className="text-[9px] text-gray-600">d={item.distance}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Indirect impact list */}
      {indirectImpacts.length > 0 && (
        <div>
          <div className="text-xs text-gray-300 font-medium mb-1.5">
            间接影响 ({indirectImpacts.length})
          </div>
          <div className="space-y-1">
            {indirectImpacts.map((item, i) => {
              const matchNode = nodes.find(n => n.id === item.node_id);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 bg-orange-500/5 border border-orange-500/20 rounded cursor-pointer hover:bg-orange-500/10 transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[matchNode?.type || 'domain'] || '#6b7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-200 font-medium">{item.node_label}</div>
                    <div className="text-[10px] text-gray-500 truncate">{item.reason}</div>
                  </div>
                  <span className="text-[9px] text-gray-600">d={item.distance}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cognition updates needed */}
      {impactRadius.cognition_updates?.length > 0 && (
        <div>
          <div className="text-xs text-gray-300 font-medium mb-1.5">
            🧠 认知层需更新 ({impactRadius.cognition_updates.length})
          </div>
          <div className="space-y-0.5">
            {impactRadius.cognition_updates.map((file: string, i: number) => (
              <div key={i} className="text-[10px] text-gray-400 py-0.5 flex items-center gap-1">
                <span className="text-[#a78bfa]">📄</span> {file}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty impact state */}
      {directImpacts.length === 0 && indirectImpacts.length === 0 && (
        <div className="text-center text-gray-500 text-xs py-4">
          <div className="text-2xl mb-2">✅</div>
          该模块暂无下游依赖，修改影响范围有限
        </div>
      )}

      {/* Summary stats */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-800 text-[10px] text-gray-600">
        <span>直接影响: {directImpacts.length}</span>
        <span>间接影响: {indirectImpacts.length}</span>
        <span>需更新: {impactRadius.cognition_updates?.length || 0}</span>
      </div>
    </div>
  );
};

export default ImpactPreview;
