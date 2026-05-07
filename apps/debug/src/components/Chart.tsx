"use client";

import { useEffect, useRef } from "react";
import type { EChartsOption, ECharts } from "echarts";

let echarts: typeof import("echarts") | null = null;

export default function Chart({
  option,
  style,
  onInit,
}: {
  option: EChartsOption;
  style?: React.CSSProperties;
  onInit?: (chart: ECharts) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    let mounted = true;
    import("echarts").then((mod) => {
      echarts = mod;
      if (!mounted || !ref.current) return;
      const chart = echarts.init(ref.current, "dark");
      chartRef.current = chart;
      chart.setOption(option);
      if (onInit) onInit(chart);
      const resizeObserver = new ResizeObserver(() => chart.resize());
      resizeObserver.observe(ref.current);
      return () => {
        resizeObserver.disconnect();
        chart.dispose();
      };
    });
    return () => {
      mounted = false;
      chartRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} style={{ width: "100%", height: 400, ...style }} />;
}
