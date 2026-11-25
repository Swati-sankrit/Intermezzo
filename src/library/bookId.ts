/** Lowercase SHA-256 hex of the bytes, or null if hashing is unavailable or fails. Never throws. */
export async function hashBytes(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
