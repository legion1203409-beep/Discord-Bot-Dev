export function shouldStartBot(nodeEnv: string | undefined, localOptIn: string | undefined): boolean {
  return nodeEnv === "production" || localOptIn === "true";
}
