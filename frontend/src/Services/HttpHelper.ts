import type { StringKeyValue } from "./types";

export const buildRequestUrl = (baseUrl: string, searchParams?: StringKeyValue): string => {
  if (!searchParams) return baseUrl;
  const query = Object.entries(searchParams)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  if (!query) return baseUrl;
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${query}`;
};
