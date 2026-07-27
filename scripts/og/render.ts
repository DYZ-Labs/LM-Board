/**
 * satori + resvg, plus the audit that runs on every card. The audit is the
 * reason the pipeline can be trusted at 63 images: nothing here is inspected by
 * eye at scale, so the geometry has to assert itself.
 */
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { CARD, chassis, type Card } from "./cards";
import { satoriFonts } from "./fonts";

export type Finding = string;

/**
 * Three checks, each of which has caught a real defect in this design:
 *   - nothing crosses the 64/1136 ink gutters
 *   - nothing leaves the 1200 × 630 frame
 *   - no two text ink boxes overlap
 */
export function audit(card: Card): Finding[] {
  const findings: Finding[] = [];

  for (const item of card.ink) {
    if (item.left < 63.4 || item.right > 1136.6) {
      findings.push(
        `${item.label}: ink ${item.left.toFixed(1)}..${item.right.toFixed(1)} crosses the gutter`,
      );
    }
    if (item.top < 0 || item.bottom > CARD.height) {
      findings.push(
        `${item.label}: ink ${item.top.toFixed(1)}..${item.bottom.toFixed(1)} leaves the frame`,
      );
    }
  }

  for (let i = 0; i < card.ink.length; i += 1) {
    for (let j = i + 1; j < card.ink.length; j += 1) {
      const a = card.ink[i];
      const b = card.ink[j];
      const overlaps =
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      if (overlaps) findings.push(`${a.label} overlaps ${b.label}`);
    }
  }

  return findings;
}

export async function renderCard(card: Card): Promise<Buffer> {
  const findings = audit(card);

  if (findings.length) {
    throw new Error(`OG card failed its own audit:\n  ${findings.join("\n  ")}`);
  }

  const svg = await satori(chassis(card.nodes) as never, {
    width: CARD.width,
    height: CARD.height,
    fonts: satoriFonts(),
    embedFont: true,
  });

  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: "width", value: CARD.width } })
      .render()
      .asPng(),
  );
}
