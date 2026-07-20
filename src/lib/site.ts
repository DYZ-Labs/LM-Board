function normalizeUrl(url: string | undefined) {
  const normalized = url?.trim().replace(/\/$/, "");
  return normalized || null;
}

const vercelHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

export const siteUrl =
  normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
  (vercelHost ? `https://${vercelHost}` : "http://localhost:3000");
export const repositoryUrl = normalizeUrl(
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY_URL,
);
export const issuesUrl = repositoryUrl ? `${repositoryUrl}/issues` : null;
