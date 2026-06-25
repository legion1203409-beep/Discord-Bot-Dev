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
  monster: assetUrl("monster.gif"),
  chest: assetUrl("chest.gif"),
  death: assetUrl("death.gif"),
};

export const COMPANION_IMG: Record<string, { base: string | null; evo: string | null }> = {
  lup: { base: assetUrl("companion_lup.png"), evo: assetUrl("companion_lup_evo.png") },
  corb: { base: assetUrl("companion_corb.png"), evo: assetUrl("companion_corb_evo.png") },
  spirit: { base: assetUrl("companion_spirit.png"), evo: assetUrl("companion_spirit_evo.png") },
  golem: { base: assetUrl("companion_golem.png"), evo: assetUrl("companion_golem_evo.png") },
};
