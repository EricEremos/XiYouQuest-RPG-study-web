"use client";

import { useEffect } from "react";

interface PageLoadMetricProps {
  name: string;
  serverDataMs: number;
}

export function PageLoadMetric({ name, serverDataMs }: PageLoadMetricProps) {
  useEffect(() => {
    console.info(`[LoadMetric] ${name} rendered`, { serverDataMs });
  }, [name, serverDataMs]);

  return null;
}
