type EmbedDraft = {
  animations: boolean;
  iconUrl: string | null;
  animationUrl: string | null;
};

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const privateIpv4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    return url.protocol === "https:" && host !== "localhost" && host !== "::1" && !privateIpv4;
  } catch {
    return false;
  }
}

export function isPublicGifUrl(value: string): boolean {
  return isPublicHttpsUrl(value) && new URL(value).pathname.toLowerCase().endsWith(".gif");
}

export function embedUrlDraftError(embeds: EmbedDraft): string | null {
  if (embeds.iconUrl && !isPublicHttpsUrl(embeds.iconUrl)) {
    return "URL-ul iconului trebuie să fie un link HTTPS public, nu un ID Discord.";
  }
  if (embeds.animations && !embeds.animationUrl) {
    return "Pentru animații, adaugă un URL HTTPS public către un fișier .gif.";
  }
  if (embeds.animationUrl && !isPublicGifUrl(embeds.animationUrl)) {
    return "URL-ul animației trebuie să fie un link HTTPS public către un fișier .gif, nu un ID Discord.";
  }
  return null;
}