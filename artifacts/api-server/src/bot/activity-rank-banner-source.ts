// Guild configuration access does not authorize requests to arbitrary hosts.
// Keep this list exact: do not accept subdomains, aliases or user-owned CNAMEs.
export const ACTIVITY_BANNER_IMAGE_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "i.imgur.com",
  "images.unsplash.com",
]);

export function activityBannerStoragePath(value: string): string | null {
  const match = /^\/api\/storage\/objects\/([a-zA-Z0-9/_-]+)$/.exec(value);
  return match ? `/objects/${match[1]}` : null;
}

export function isSupportedActivityBannerSource(value: string): boolean {
  if (activityBannerStoragePath(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ACTIVITY_BANNER_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
