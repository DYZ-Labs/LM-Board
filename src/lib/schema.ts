import { z } from "zod";

import { BENCHMARK_CATEGORIES } from "@/lib/categories";

const slugSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Must be a lowercase, kebab-case slug",
  );

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must use YYYY-MM-DD format")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Must be a valid calendar date");

const urlSchema = z.httpUrl();

export const SourceSchema = z
  .object({
    url: urlSchema,
    retrieved: isoDateSchema,
  })
  .strict();

export const ModelSchema = z
  .object({
    id: slugSchema,
    name: z.string().trim().min(1),
    lab: z.string().trim().min(1),
    releaseDate: isoDateSchema,
    openWeights: z.boolean(),
    contextWindow: z.number().int().positive().optional(),
    pricing: z
      .object({
        input: z.number().finite().nonnegative(),
        output: z.number().finite().nonnegative(),
        source: SourceSchema,
      })
      .strict()
      .optional(),
    url: urlSchema,
  })
  .strict();

export const BenchmarkSchema = z
  .object({
    id: slugSchema,
    name: z.string().trim().min(1),
    category: z.enum(BENCHMARK_CATEGORIES),
    description: z.string().trim().min(1),
    unit: z.enum(["percent", "score"]),
    sourceUrl: urlSchema,
  })
  .strict();

export const ScoreSchema = z
  .object({
    modelId: slugSchema,
    benchmarkId: slugSchema,
    value: z.number().finite(),
    source: SourceSchema,
    settings: z.string().trim().min(1).optional(),
    reasoningEffort: z.string().trim().min(1).max(40).optional(),
    selfReported: z.boolean(),
  })
  .strict();

export const ModelsFileSchema = z.array(ModelSchema).min(1);
export const BenchmarksFileSchema = z.array(BenchmarkSchema).min(1);
export const ScoresFileSchema = z.array(ScoreSchema).min(1);

export type Model = z.infer<typeof ModelSchema>;
export type Benchmark = z.infer<typeof BenchmarkSchema>;
export type Score = z.infer<typeof ScoreSchema>;
