import { z } from "zod";

import { BENCHMARK_CATEGORIES } from "@/lib/categories";
import type { ResolvedScore } from "@/lib/provenance";

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

export const PublisherSchema = z
  .object({
    id: slugSchema,
    name: z.string().trim().min(1),
    url: urlSchema,
    type: z.enum(["independent", "benchmark-author", "vendor"]),
    runsOwnEvals: z.boolean(),
    vendorForLab: z.string().trim().min(1).optional(),
    note: z.string().trim().min(1).optional(),
  })
  .strict();

export const EvidenceSchema = z
  .object({
    quote: z.string().trim().min(1),
    printedBenchmarkName: z.string().trim().min(1),
    printedConditions: z.string().trim().min(1).nullable(),
    printedColumnHeader: z.string().trim().min(1).nullable(),
  })
  .strict();

export const MeasurementSchema = z
  .object({
    modelId: slugSchema,
    benchmarkId: slugSchema,
    publisherId: slugSchema,
    value: z.number().finite(),
    source: SourceSchema,
    settings: z.string().trim().min(1).optional(),
    harness: z.string().trim().min(1).optional(),
    reasoningEffort: z.string().trim().min(1).max(40).optional(),
    evidence: EvidenceSchema.optional(),
  })
  .strict();

export const CandidateSchema = MeasurementSchema.extend({
  evidence: EvidenceSchema,
  extractedBy: z.enum(["agent", "human"]),
  review: z.enum(["pending", "accepted", "rejected"]),
  reviewNote: z.string().trim().min(1).optional(),
}).strict();

export const CandidateFileSchema = z
  .object({
    source: SourceSchema,
    note: z.string().trim().min(1).optional(),
    candidates: z.array(CandidateSchema),
  })
  .strict()
  .superRefine((file, context) => {
    for (const [index, candidate] of file.candidates.entries()) {
      if (
        candidate.source.url !== file.source.url ||
        candidate.source.retrieved !== file.source.retrieved
      ) {
        context.addIssue({
          code: "custom",
          path: ["candidates", index, "source"],
          message: "Must match the candidate page source and retrieval date",
        });
      }
    }
  });

export const ModelsFileSchema = z.array(ModelSchema).min(1);
export const BenchmarksFileSchema = z.array(BenchmarkSchema).min(1);
export const PublishersFileSchema = z.array(PublisherSchema).min(1);
export const MeasurementsFileSchema = z.array(MeasurementSchema).min(1);

export type Model = z.infer<typeof ModelSchema>;
export type Benchmark = z.infer<typeof BenchmarkSchema>;
export type Publisher = z.infer<typeof PublisherSchema>;
export type Measurement = z.infer<typeof MeasurementSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type CandidateFile = z.infer<typeof CandidateFileSchema>;
export type Score = ResolvedScore;
