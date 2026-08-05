/** Root-relative URL for bundled asset paths (works from /chat.js and /_bun/client/). */
export function publicAssetUrl(url) {
  if (/^(https?:|\/|data:|blob:)/.test(url)) return url;
  return `/${String(url).replace(/^\.\//, "")}`;
}
