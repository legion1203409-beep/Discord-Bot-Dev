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
  monster: assetUrl("monster_14.png"),
  chest: assetUrl("chest.gif"),
  death: assetUrl("death.gif"),
  trader: assetUrl("trader2.gif"),
  shop: assetUrl("shop2.gif"),
};

/**
 * Per-monster, per-rarity art — index i matches MONSTERS[i] in survival.ts.
 * "comun" gets the static wide PNG; higher rarities get an animated GIF with a
 * rarity-colored pulsing aura (blue/purple/gold/red). Mini-bosses use the mitic one.
 */
export function monsterImg(index: number, rarity: string): string | null {
  const n = String(index + 1).padStart(2, "0");
  const tier = rarity === "boss" ? "mitic" : rarity;
  if (tier === "rar" || tier === "epic" || tier === "legendar" || tier === "mitic") {
    return assetUrl(`monster_${n}_${tier}.gif`);
  }
  return assetUrl(`monster_${n}_wide.png`);
}

/** One image per named monster — index i matches MONSTERS[i] in survival.ts. */
export const MONSTER_IMG: (string | null)[] = Array.from({ length: 14 }, (_, i) =>
  assetUrl(`monster_${String(i + 1).padStart(2, "0")}_wide.png`),
);

export const CHEST_IMG: Record<string, string | null> = {
  bronz:  assetUrl("chest_bronz.gif"),
  argint: assetUrl("chest_argint.gif"),
  aur:    assetUrl("chest_aur.gif"),
  mitic:  assetUrl("chest_mitic.gif"),
  regal:  assetUrl("chest_regal_anim.gif"),
};

export const KEY_IMG: Record<string, string | null> = {
  rar:   assetUrl("key_rar_anim.gif"),
  epic:  assetUrl("key_epic_anim.gif"),
  regal: assetUrl("key_regal_anim.gif"),
};

export const COMPANION_IMG: Record<string, { base: string | null; evo: string | null }> = {
  lup: { base: assetUrl("companion_lup_anim.gif"), evo: assetUrl("companion_lup_evo_anim.gif") },
  corb: { base: assetUrl("companion_corb_anim.gif"), evo: assetUrl("companion_corb_evo_anim.gif") },
  spirit: { base: assetUrl("companion_spirit_anim.gif"), evo: assetUrl("companion_spirit_evo_anim.gif") },
  golem: { base: assetUrl("companion_golem_anim.gif"), evo: assetUrl("companion_golem_evo_anim.gif") },
};
