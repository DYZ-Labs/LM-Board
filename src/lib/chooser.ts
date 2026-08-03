import type { LeaderboardData, LeaderboardScope } from "@/lib/data";

export const CHOOSER_TASKS = [
  "overall",
  "reasoning",
  "coding",
  "math",
  "agentic",
] as const;

export type ChooserTask = (typeof CHOOSER_TASKS)[number];
export type ChooserAccess = "any" | "api" | "open";
export type ContextFloor = 0 | 128000 | 200000 | 400000 | 1000000;

export type ChooserState = {
  task: ChooserTask;
  access: ChooserAccess;
  minContext: ContextFloor;
  maxInputPrice: number | null;
  maxOutputPrice: number | null;
};

export const DEFAULT_CHOOSER_STATE: ChooserState = {
  task: "overall",
  access: "any",
  minContext: 0,
  maxInputPrice: null,
  maxOutputPrice: null,
};

export type ChooserScopeSummary = Pick<
  LeaderboardScope,
  | "index"
  | "rank"
  | "coverageCount"
  | "coverageTotal"
  | "estimatedCount"
  | "rankedFieldSize"
>;

export type ChooserPricing = {
  input: number;
  output: number;
  source: {
    url: string;
    retrieved: string;
  };
};

export type ChooserModel = {
  id: string;
  name: string;
  lab: string;
  openWeights: boolean;
  contextWindow: number | null;
  pricing: ChooserPricing | null;
  scopes: Record<ChooserTask, ChooserScopeSummary>;
};

type PackedScope = readonly [
  index: number | null,
  rank: number | null,
  coverageCount: number,
  coverageTotal: number,
  estimatedCount: number,
  rankedFieldSize: number,
];

type PackedPricing = readonly [
  input: number,
  output: number,
  sourceIndex: number,
  retrievedIndex: number,
];

type PackedChooserModel = readonly [
  id: string,
  name: string,
  lab: string,
  openWeights: 0 | 1,
  contextWindow: number | null,
  pricing: PackedPricing | null,
  scopes: readonly PackedScope[],
];

export type ChooserPayload = {
  sources: readonly string[];
  dates: readonly string[];
  models: readonly PackedChooserModel[];
};

export type ShortlistLabel =
  | "Capability leader"
  | "Lowest input price"
  | "Largest context"
  | "Open-weights leader"
  | "Next-highest capability";

export type ShortlistCard = {
  model: ChooserModel;
  scope: ChooserScopeSummary & { index: number; rank: number };
  labels: ShortlistLabel[];
  gapFromLeader: number;
};

export type ShortlistCounts = {
  total: number;
  afterAccess: number;
  afterContext: number;
  afterPrice: number;
  afterCoverage: number;
  unrankedExcluded: number;
};

export type ChooserShortlist = {
  state: ChooserState;
  cards: ShortlistCard[];
  counts: ShortlistCounts;
  capabilityLeader: ChooserModel | null;
};

const ACCESS_VALUES = new Set<ChooserAccess>(["any", "api", "open"]);
const CONTEXT_FROM_URL = new Map<string, ContextFloor>([
  ["128k", 128000],
  ["200k", 200000],
  ["400k", 400000],
  ["1m", 1000000],
]);
const CONTEXT_TO_URL = new Map<ContextFloor, string>(
  [...CONTEXT_FROM_URL].map(([label, value]) => [value, label]),
);
const TASK_VALUES = new Set<ChooserTask>(CHOOSER_TASKS);
const nameCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function priceFromUrl(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function chooserStateFromSearchParams(
  params: Pick<URLSearchParams, "get">,
): ChooserState {
  const taskValue = params.get("task");
  const accessValue = params.get("access");
  const contextValue = params.get("context");

  return {
    task:
      taskValue !== null && TASK_VALUES.has(taskValue as ChooserTask)
        ? (taskValue as ChooserTask)
        : DEFAULT_CHOOSER_STATE.task,
    access:
      accessValue !== null && ACCESS_VALUES.has(accessValue as ChooserAccess)
        ? (accessValue as ChooserAccess)
        : DEFAULT_CHOOSER_STATE.access,
    minContext:
      contextValue === null
        ? DEFAULT_CHOOSER_STATE.minContext
        : CONTEXT_FROM_URL.get(contextValue) ??
          DEFAULT_CHOOSER_STATE.minContext,
    maxInputPrice: priceFromUrl(params.get("input")),
    maxOutputPrice: priceFromUrl(params.get("output")),
  };
}

/**
 * Write only chooser-owned keys. Campaign parameters and other foreign state
 * survive sharing, applying, resetting and browser-history restoration.
 */
export function chooserStateToUrl(input: URL, state: ChooserState) {
  const url = new URL(input);

  if (state.task === DEFAULT_CHOOSER_STATE.task) url.searchParams.delete("task");
  else url.searchParams.set("task", state.task);

  if (state.access === DEFAULT_CHOOSER_STATE.access) {
    url.searchParams.delete("access");
  } else {
    url.searchParams.set("access", state.access);
  }

  if (state.minContext === DEFAULT_CHOOSER_STATE.minContext) {
    url.searchParams.delete("context");
  } else {
    url.searchParams.set("context", CONTEXT_TO_URL.get(state.minContext)!);
  }

  if (state.maxInputPrice === null) url.searchParams.delete("input");
  else url.searchParams.set("input", String(state.maxInputPrice));

  if (state.maxOutputPrice === null) url.searchParams.delete("output");
  else url.searchParams.set("output", String(state.maxOutputPrice));

  return url;
}

export function canonicalizeChooserUrl(input: URL) {
  return chooserStateToUrl(
    input,
    chooserStateFromSearchParams(input.searchParams),
  );
}

function scopeToPayload(scope: LeaderboardScope): PackedScope {
  return [
    scope.index,
    scope.rank,
    scope.coverageCount,
    scope.coverageTotal,
    scope.estimatedCount,
    scope.rankedFieldSize,
  ];
}

/**
 * The chooser gets identity, five derived scope summaries, access facts and
 * sourced pricing. Benchmark cells, evaluation settings and score sources are
 * deliberately unreachable from this projection.
 */
export function toChooserPayload(
  data: Pick<LeaderboardData, "rows">,
): ChooserPayload {
  const priced = data.rows.flatMap((row) =>
    row.model.pricing ? [row.model.pricing] : [],
  );
  const sources = [...new Set(priced.map((pricing) => pricing.source.url))];
  const dates = [...new Set(priced.map((pricing) => pricing.source.retrieved))];
  const sourceIndexes = new Map(sources.map((source, index) => [source, index]));
  const dateIndexes = new Map(dates.map((date, index) => [date, index]));

  return {
    sources,
    dates,
    models: data.rows.map((row) => {
      const pricing = row.model.pricing;
      return [
        row.model.id,
        row.model.name,
        row.model.lab,
        row.model.openWeights ? 1 : 0,
        row.model.contextWindow ?? null,
        pricing
          ? [
              pricing.input,
              pricing.output,
              sourceIndexes.get(pricing.source.url)!,
              dateIndexes.get(pricing.source.retrieved)!,
            ]
          : null,
        CHOOSER_TASKS.map((task) => scopeToPayload(row.scopes[task])),
      ];
    }),
  };
}

export function expandChooserPayload(payload: ChooserPayload): ChooserModel[] {
  return payload.models.map(
    ([id, name, lab, openWeights, contextWindow, pricing, scopes]) => ({
      id,
      name,
      lab,
      openWeights: openWeights === 1,
      contextWindow,
      pricing: pricing
        ? {
            input: pricing[0],
            output: pricing[1],
            source: {
              url: payload.sources[pricing[2]]!,
              retrieved: payload.dates[pricing[3]]!,
            },
          }
        : null,
      scopes: Object.fromEntries(
        CHOOSER_TASKS.map((task, index) => {
          const scope = scopes[index]!;
          return [
            task,
            {
              index: scope[0],
              rank: scope[1],
              coverageCount: scope[2],
              coverageTotal: scope[3],
              estimatedCount: scope[4],
              rankedFieldSize: scope[5],
            },
          ];
        }),
      ) as Record<ChooserTask, ChooserScopeSummary>,
    }),
  );
}

function compareName(left: ChooserModel, right: ChooserModel) {
  return (
    nameCollator.compare(left.name, right.name) || left.id.localeCompare(right.id)
  );
}

function inputPrice(model: ChooserModel) {
  return model.pricing?.input ?? Number.POSITIVE_INFINITY;
}

function capabilityOrder(task: ChooserTask) {
  return (left: ChooserModel, right: ChooserModel) =>
    (right.scopes[task].index as number) -
      (left.scopes[task].index as number) ||
    inputPrice(left) - inputPrice(right) ||
    compareName(left, right);
}

function qualifiesForAccess(model: ChooserModel, access: ChooserAccess) {
  if (access === "api") return model.pricing !== null;
  if (access === "open") return model.openWeights;
  return model.openWeights || model.pricing !== null;
}

function qualifiesForContext(model: ChooserModel, floor: ContextFloor) {
  return (
    floor === 0 ||
    (model.contextWindow !== null && model.contextWindow >= floor)
  );
}

function qualifiesForPrice(model: ChooserModel, state: ChooserState) {
  if (state.maxInputPrice === null && state.maxOutputPrice === null) return true;
  if (!model.pricing) return false;

  return (
    (state.maxInputPrice === null ||
      model.pricing.input <= state.maxInputPrice) &&
    (state.maxOutputPrice === null ||
      model.pricing.output <= state.maxOutputPrice)
  );
}

function rankedScope(model: ChooserModel, task: ChooserTask) {
  const scope = model.scopes[task];
  return scope.index !== null && scope.rank !== null;
}

export function buildChooserShortlist(
  models: ChooserModel[],
  state: ChooserState,
): ChooserShortlist {
  const accessEligible = models.filter((model) =>
    qualifiesForAccess(model, state.access),
  );
  const contextEligible = accessEligible.filter((model) =>
    qualifiesForContext(model, state.minContext),
  );
  const priceEligible = contextEligible.filter((model) =>
    qualifiesForPrice(model, state),
  );
  const ranked = priceEligible
    .filter((model) => rankedScope(model, state.task))
    .sort(capabilityOrder(state.task));
  const counts: ShortlistCounts = {
    total: models.length,
    afterAccess: accessEligible.length,
    afterContext: contextEligible.length,
    afterPrice: priceEligible.length,
    afterCoverage: ranked.length,
    unrankedExcluded: priceEligible.length - ranked.length,
  };
  const capabilityLeader = ranked[0] ?? null;

  if (!capabilityLeader) {
    return { state, cards: [], counts, capabilityLeader: null };
  }

  const winners: Array<[ChooserModel | undefined, ShortlistLabel]> = [
    [capabilityLeader, "Capability leader"],
    [
      [...ranked]
        .filter((model) => model.pricing !== null)
        .sort(
          (left, right) =>
            left.pricing!.input - right.pricing!.input ||
            left.pricing!.output - right.pricing!.output ||
            (right.scopes[state.task].index as number) -
              (left.scopes[state.task].index as number) ||
            compareName(left, right),
        )[0],
      "Lowest input price",
    ],
    [
      [...ranked]
        .filter((model) => model.contextWindow !== null)
        .sort(
          (left, right) =>
            right.contextWindow! - left.contextWindow! ||
            (right.scopes[state.task].index as number) -
              (left.scopes[state.task].index as number) ||
            inputPrice(left) - inputPrice(right) ||
            compareName(left, right),
        )[0],
      "Largest context",
    ],
    [
      ranked.filter((model) => model.openWeights).sort(capabilityOrder(state.task))[0],
      "Open-weights leader",
    ],
  ];
  const labelsById = new Map<string, ShortlistLabel[]>();
  const ordered: ChooserModel[] = [];

  for (const [model, label] of winners) {
    if (!model) continue;
    const labels = labelsById.get(model.id);
    if (labels) labels.push(label);
    else {
      labelsById.set(model.id, [label]);
      ordered.push(model);
    }
  }

  for (const model of ranked) {
    if (ordered.length >= 4) break;
    if (labelsById.has(model.id)) continue;
    labelsById.set(model.id, ["Next-highest capability"]);
    ordered.push(model);
  }

  const leaderIndex = capabilityLeader.scopes[state.task].index as number;
  const cards = ordered.slice(0, 4).map((model) => {
    const scope = model.scopes[state.task] as ChooserScopeSummary & {
      index: number;
      rank: number;
    };
    return {
      model,
      scope,
      labels: labelsById.get(model.id)!,
      gapFromLeader: leaderIndex - scope.index,
    };
  });

  return { state, cards, counts, capabilityLeader };
}
