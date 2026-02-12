export function getBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.API_BASE_URL;

  if (fromEnv && fromEnv.length > 0) {
    const trimmed = fromEnv.replace(/\/+$/, "");
    const isLocalhost =
      trimmed.includes("://localhost") ||
      trimmed.includes("://127.0.0.1") ||
      trimmed.includes("://[::1]");

    if (!isLocalhost && trimmed.startsWith("http://")) {
      return `https://${trimmed.slice("http://".length)}`;
    }

    return trimmed;
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.length > 0) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}
