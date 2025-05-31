import React, { useEffect, useRef } from "react";
import { FluidRenderer } from "./FluidRenderer";
import type { Config } from "./types";

export interface FluidSimulationProps {
  width?: number;
  height?: number;
  className?: string;
  config?: Partial<Config>;
}

export function FluidSimulation({
  width = 800,
  height = 600,
  className = "",
  config,
}: FluidSimulationProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FluidRenderer | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      const renderer = new FluidRenderer(canvasRef.current, config);
      rendererRef.current = renderer;

      return () => {
        renderer.destroy();
      };
    } catch (error) {
      console.error("Failed to initialize Fluid Simulation:", error);
    }
  }, [config]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (config) {
      renderer.updateConfig(config);
    }
  }, [config]);

  return (
    <div className={`fluid-simulation-container ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          display: "block",
        }}
      />
    </div>
  );
}
