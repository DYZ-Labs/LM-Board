import { toCommandPalettePayload } from "@/lib/commandPalette";
import { loadLeaderboardData } from "@/lib/data";

export const dynamic = "force-static";

/**
 * Score-free destination index, fetched only after the global search shortcut.
 * Keeping it outside route Flight payloads avoids repeating the same model
 * names on every static page and every embedded not-found boundary.
 */
export function GET() {
  const data = loadLeaderboardData();

  return new Response(
    JSON.stringify(
      toCommandPalettePayload(data.rows, data.benchmarks),
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
