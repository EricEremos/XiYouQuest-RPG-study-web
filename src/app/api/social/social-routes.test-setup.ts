import { vi } from "vitest";
import { NextRequest } from "next/server";

export const currentUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "student@connect.ust.hk",
};

export function request(path: string) {
  return new NextRequest(`https://cle-xyq.hkust.edu.hk/api/social${path}`);
}

export type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

export function query(result: QueryResult) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    or: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}
