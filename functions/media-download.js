// Validación de URLs de descarga de archivos generados por AllAIs (Firebase Storage).

function parseOwnStorageUrl(raw, bucketName) {
  let url;
  try { url = new URL(String(raw || "")); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "firebasestorage.googleapis.com") return null;
  const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!match || match[1] !== bucketName) return null;
  const objectPath = decodeURIComponent(match[2]);
  if (!/^(videos|images)\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(objectPath)) return null;
  const token = url.searchParams.get("token") || "";
  if (!token) return null;
  return { objectPath, token };
}

module.exports = { parseOwnStorageUrl };
