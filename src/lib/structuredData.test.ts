import { describe, expect, it } from "vitest";

import { loadLeaderboardData } from "./data";
import { modelRecordFreshness, siteUrl } from "./site";
import {
  compareGraph,
  homeGraph,
  methodologyGraph,
  modelGraph,
  valueGraph,
} from "./structuredData";

const data = loadLeaderboardData();
const LM_BOARD_ID = `${siteUrl}/#organization`;
const ARTIFICIAL_ANALYSIS_ID =
  "https://artificialanalysis.ai/#organization";

type Node = Record<string, unknown>;
type Graph = { "@graph": Node[] };

function nodes(graph: Graph) {
  return graph["@graph"];
}

function typeOf(node: Node) {
  return node["@type"];
}

function find(graph: Graph, type: string) {
  return nodes(graph).find((node) => typeOf(node) === type);
}

function findById(graph: Graph, id: string) {
  return nodes(graph).find((node) => node["@id"] === id);
}

function referenceIds(value: unknown, references = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) referenceIds(item, references);
    return references;
  }
  if (value === null || typeof value !== "object") return references;

  const object = value as Node;
  if (
    typeof object["@id"] === "string" &&
    object["@type"] === undefined
  ) {
    references.add(object["@id"]);
  }
  for (const nested of Object.values(object)) {
    referenceIds(nested, references);
  }
  return references;
}

function expectClosedGraph(graph: Graph) {
  const ids = new Set(
    nodes(graph)
      .map((node) => node["@id"])
      .filter((id): id is string => typeof id === "string"),
  );

  for (const id of referenceIds(graph)) {
    expect(ids, `missing graph entity ${id}`).toContain(id);
  }
}

describe("modelGraph", () => {
  it("does not misrepresent benchmarks as ratings or prices as stock", () => {
    for (const row of data.rows) {
      const serialized = JSON.stringify(modelGraph(row, data));

      expect(serialized).not.toContain("aggregateRating");
      expect(serialized).not.toContain("AggregateRating");
      expect(serialized).not.toContain("ratingValue");
      expect(serialized).not.toContain("InStock");
      expect(serialized).not.toContain("availability");
    }
  });

  it("keeps LM Board, Artificial Analysis, provider and model ownership distinct", () => {
    for (const row of data.rows) {
      const graph = modelGraph(row, data);
      const model = find(graph, "SoftwareApplication") as Node;
      const publisher = model.publisher as Node;
      const provider = findById(graph, String(publisher["@id"])) as Node;

      expect(findById(graph, LM_BOARD_ID)?.name).toBe("LM Board");
      expect(findById(graph, ARTIFICIAL_ANALYSIS_ID)?.name).toBe(
        "Artificial Analysis",
      );
      expect(publisher["@id"]).not.toBe(LM_BOARD_ID);
      expect(provider["@type"]).toBe("Organization");
      expect(provider.name).toBe(row.model.lab);
      expect(model.author).toEqual(publisher);
      expect(model.datePublished).toBe(row.model.releaseDate);
    }
  });

  it("makes the local WebPage point to the score Dataset as its main entity", () => {
    const row = data.rows[0];
    const graph = modelGraph(row, data);
    const webpage = find(graph, "WebPage") as Node;
    const mainEntity = webpage.mainEntity as Node;
    const dataset = findById(graph, String(mainEntity["@id"])) as Node;

    expect(webpage.url).toBe(`${siteUrl}/model/${row.model.id}`);
    expect(dataset["@type"]).toBe("Dataset");
    expect(dataset.about).toEqual({
      "@id": `${siteUrl}/model/${row.model.id}#model`,
    });
    expect(webpage.dateModified).toBe(
      modelRecordFreshness(row).lastModified,
    );
    expectClosedGraph(graph);
  });

  it("carries each measured value with source, retrieval date and settings", () => {
    const row = data.rows[0];
    const graph = modelGraph(row, data);
    const dataset = nodes(graph).find(
      (node) =>
        node["@type"] === "Dataset" &&
        node["@id"] === `${siteUrl}/model/${row.model.id}#dataset`,
    ) as Node;
    const variables = dataset.variableMeasured as Node[];
    const measured = data.benchmarks.filter(
      (benchmark) => row.scoresByBenchmark[benchmark.id] != null,
    );

    expect(variables).toHaveLength(measured.length);

    for (const variable of variables) {
      const benchmark = data.benchmarks.find(
        (entry) => entry.name === variable.name,
      )!;
      const score = row.scoresByBenchmark[benchmark.id]!;
      const references = variable.valueReference as Node[];
      const retrieval = references.find(
        (reference) => reference.name === "Source retrieval date",
      );
      const publisher = references.find(
        (reference) => reference.name === "Score publisher",
      );

      expect(variable.value).toBe(score.value);
      expect(variable.url).toBe(score.source.url);
      expect(retrieval).toEqual({
        "@type": "PropertyValue",
        name: "Source retrieval date",
        value: score.source.retrieved,
      });
      expect(publisher).toEqual({
        "@type": "PropertyValue",
        name: "Score publisher",
        value: score.selfReported
          ? row.model.lab
          : "Artificial Analysis",
        url: score.selfReported
          ? row.model.url
          : "https://artificialanalysis.ai/",
      });
      if (score.settings) {
        expect(String(variable.description)).toContain(score.settings);
      }
      expect(String(variable.description)).toContain(
        score.selfReported
          ? `Vendor-reported by ${row.model.lab}.`
          : "Published by Artificial Analysis.",
      );
    }
  });

  it("keeps a vendor-reported qualification attached to the exact score", () => {
    const row = data.rows[0];
    const benchmark = data.benchmarks[0];
    const score = row.scoresByBenchmark[benchmark.id]!;
    const mixed = {
      ...row,
      scoresByBenchmark: {
        ...row.scoresByBenchmark,
        [benchmark.id]: { ...score, selfReported: true },
      },
    };
    const graph = modelGraph(mixed, data);
    const dataset = findById(
      graph,
      `${siteUrl}/model/${row.model.id}#dataset`,
    ) as Node;
    const variable = (dataset.variableMeasured as Node[]).find(
      (entry) => entry.name === benchmark.name,
    )!;
    const publisher = (variable.valueReference as Node[]).find(
      (reference) => reference.name === "Score publisher",
    );

    expect(variable.description).toContain(
      `Vendor-reported by ${row.model.lab}.`,
    );
    expect(publisher?.value).toBe(row.model.lab);
    expect(publisher?.url).toBe(row.model.url);
  });

  it("never invents a value for an unmeasured benchmark", () => {
    for (const row of data.rows) {
      const graph = modelGraph(row, data);
      const dataset = findById(
        graph,
        `${siteUrl}/model/${row.model.id}#dataset`,
      ) as Node;
      const names = (dataset.variableMeasured as Node[]).map(
        (variable) => variable.name,
      );

      for (const benchmark of data.benchmarks) {
        if (row.scoresByBenchmark[benchmark.id] == null) {
          expect(names).not.toContain(benchmark.name);
        }
      }
    }
  });

  it("lists model prices without claiming availability", () => {
    const priced = data.rows.find((row) => row.model.pricing)!;
    const unpriced = data.rows.find((row) => !row.model.pricing);
    const pricedModel = find(
      modelGraph(priced, data),
      "SoftwareApplication",
    ) as Node;
    const offers = pricedModel.offers as Node[];

    expect(offers[0].price).toBe(priced.model.pricing!.input);
    expect(offers[1].price).toBe(priced.model.pricing!.output);
    expect(offers.every((offer) => offer.url === priced.model.pricing!.source.url)).toBe(
      true,
    );
    expect(offers.every((offer) => offer.availability === undefined)).toBe(
      true,
    );

    if (unpriced) {
      const bareModel = find(
        modelGraph(unpriced, data),
        "SoftwareApplication",
      ) as Node;
      expect(bareModel.offers).toBeUndefined();
    }
  });
});

describe("homeGraph", () => {
  it("emits a complete, closed entity graph", () => {
    const graph = homeGraph(data);

    expect(nodes(graph).map(typeOf)).toEqual([
      "Organization",
      "Organization",
      "WebSite",
      "WebPage",
      "Dataset",
      "ItemList",
    ]);
    expectClosedGraph(graph);
  });

  it("makes the Dataset the homepage main entity and derives every count", () => {
    const graph = homeGraph(data);
    const webpage = find(graph, "WebPage") as Node;
    const dataset = find(graph, "Dataset") as Node;

    expect(webpage.mainEntity).toEqual({ "@id": dataset["@id"] });
    expect(String(dataset.description)).toContain(
      `${data.rows.length} frontier`,
    );
    expect(String(dataset.description)).toContain(
      `${data.scoreCount} source-linked`,
    );
    expect(dataset.temporalCoverage).toBe(
      `${data.oldestRetrieved}/${data.lastUpdated}`,
    );
    expect((dataset.variableMeasured as Node[])).toHaveLength(
      data.benchmarks.length,
    );
    expect(String(dataset.measurementTechnique)).toContain(
      "LM Board runs no evaluations",
    );
    expect(String(dataset.usageInfo)).toContain(
      "Third-party benchmark measurements remain subject to their source terms.",
    );
  });

  it("lists the top of the board in rank order", () => {
    const list = find(homeGraph(data), "ItemList") as Node;
    const items = list.itemListElement as Node[];
    const leader = data.rows.find((row) => row.scopes.overall.rank === 1)!;

    expect(items.length).toBeLessThanOrEqual(20);
    expect(items[0].name).toBe(leader.model.name);
    expect(items.map((item) => item.position)).toEqual(
      items.map((_, position) => position + 1),
    );
  });
});

describe("page graphs", () => {
  it("gives methodology a WebPage whose main entity is the TechArticle", () => {
    const graph = methodologyGraph(data);
    const page = find(graph, "WebPage") as Node;
    const article = find(graph, "TechArticle") as Node;

    expect(page.mainEntity).toEqual({ "@id": article["@id"] });
    expect(article.mainEntityOfPage).toEqual({ "@id": page["@id"] });
    expectClosedGraph(graph);
  });

  it("gives comparison a closed WebPage graph without claiming every number is cited", () => {
    const graph = compareGraph(data);
    const page = find(graph, "WebPage") as Node;

    expect(page.mainEntity).toEqual({ "@id": `${siteUrl}/#dataset` });
    expect(String(page.description)).toContain(
      "pricing, release dates, and weight availability",
    );
    expect(String(page.description)).not.toContain("links to its source");
    expectClosedGraph(graph);
  });

  it("gives the value view its own closed WebPage graph", () => {
    const graph = valueGraph(data);
    const page = find(graph, "WebPage") as Node;

    expect(page.url).toBe(`${siteUrl}/value`);
    expect(page.mainEntity).toEqual({ "@id": `${siteUrl}/#dataset` });
    expectClosedGraph(graph);
  });
});
