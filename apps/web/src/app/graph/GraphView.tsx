"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Graph } from "@dontopedia/ui";
import type { GraphNode, GraphEdge } from "@dontopedia/ui";
import { iriToSlug } from "@dontopedia/sdk";

interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  className?: string;
}

export function GraphView({ nodes, edges, className }: GraphViewProps) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 800, height: 600 });

  React.useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setSize({
          width: Math.floor(rect.width) || 800,
          height: Math.floor(rect.height) || 600,
        });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const handleNodeClick = React.useCallback(
    (id: string) => {
      router.push(`/article/${iriToSlug(id)}`);
    },
    [router],
  );

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      {size.width > 0 && (
        <Graph
          nodes={nodes}
          edges={edges}
          width={size.width}
          height={size.height}
          onNodeClick={handleNodeClick}
          className={className}
        />
      )}
    </div>
  );
}
