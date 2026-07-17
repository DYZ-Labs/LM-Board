function normalizeUrl(url: string | undefined) {
  const normalized = url?.trim().replace(/\/$/, "");
  return normalized || null;
}

export const repositoryUrl = normalizeUrl(
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY_URL,
);
export const issuesUrl = repositoryUrl ? `${repositoryUrl}/issues` : null;
