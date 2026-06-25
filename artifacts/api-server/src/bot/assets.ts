function publicBaseUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev.trim()}`;
  return "";
}

const BASE = publicBaseUrl();

function assetUrl(file: string): string | null {
  return BASE ? `${BASE}/api/assets/${file}` : null;
}

export const IMG = {
  monster: assetUrl("monster.png"),
  chest: assetUrl("chest.png"),
  death: assetUrl("death.png"),
};
