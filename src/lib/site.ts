function normalizeUrl(url: string | undefined) {
  const normalized = url?.trim().replace(/\/$/, "");
  return normalized || null;
}

const vercelHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

const resolvedSiteUrl =
  normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");

if (
  process.env.NODE_ENV === "production" &&
  resolvedSiteUrl === "http://localhost:3000"
) {
  throw new Error(
    "Production builds require NEXT_PUBLIC_SITE_URL or a Vercel deployment URL; refusing to use http://localhost:3000 for public metadata.",
  );
}

export const siteUrl = resolvedSiteUrl;
export const repositoryUrl = normalizeUrl(
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY_URL,
);
export const issuesUrl = repositoryUrl ? `${repositoryUrl}/issues` : null;
