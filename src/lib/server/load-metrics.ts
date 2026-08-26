import "server-only";

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult {
  error: QueryError | null;
}

export interface MeasuredQuery<T> {
  result: T;
  durationMs: number;
}

export async function measureServerQuery<T extends QueryResult>(
  name: string,
  query: PromiseLike<T>
): Promise<MeasuredQuery<T>> {
  const startedAt = performance.now();
  const result = await query;
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;

  if (result.error) {
    console.error(`[LoadMetric] ${name} failed`, {
      durationMs,
      code: result.error.code ?? "unknown",
    });
  } else {
    console.info(`[LoadMetric] ${name} succeeded`, { durationMs });
  }

  return { result, durationMs };
}
