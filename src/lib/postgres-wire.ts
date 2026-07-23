import { z } from "zod";

const postgresNumericStringSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .transform(Number);

export const postgresNumberSchema = z.union([
  z.number().finite(),
  postgresNumericStringSchema,
]);

export const postgresIntegerSchema = postgresNumberSchema.pipe(
  z.number().int(),
);
