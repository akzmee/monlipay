/**
 * Local storage utility for tracking created links.
 * This is client-side only — no server, no database.
 * The source of truth is always the on-chain contract.
 *
 * The shareableUrl field contains the full claim URL including the
 * #fragment with the secret key. This is safe to store in localStorage
 * because localStorage is client-side only and the URL fragment is
 * never sent to any server.
 *
 * SECURITY: The shareableUrl MUST be saved at link creation time.
 * The ephemeral secret key embedded in the URL fragment cannot be
 * regenerated — if lost, the link becomes unclaimable AND the funds
 * are stuck until expiry (then refundable via autoRefund).
 */

export interface StoredLink {
  depositId: string;
  token: string;
  amount: string; // in ether units for display
  expiry: number; // unix timestamp
  createdAt: number; // unix timestamp
  sender: string;
  /**
   * Full claim URL including the #fragment with the secret key.
   * Required for new entries. Old entries (pre-fix) may lack this
   * field — they are migratively dropped on read.
   */
  shareableUrl?: string;
  /**
   * Client-side status hint. The authoritative state is always on-chain.
   * Updated optimistically; reconciled with on-chain state on next read.
   */
  status?: "active" | "claimed" | "refunded" | "expired";
}

const STORAGE_KEY = "monlipay_links";

/**
 * Validate that a parsed object looks like a StoredLink.
 * Filters out corrupted entries from old/buggy localStorage state.
 */
function isValidStoredLink(obj: unknown): obj is StoredLink {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.depositId === "string" &&
    typeof o.token === "string" &&
    typeof o.amount === "string" &&
    typeof o.expiry === "number" &&
    typeof o.createdAt === "number" &&
    typeof o.sender === "string"
    // shareableUrl is optional for backwards compatibility (old entries)
  );
}

export function getStoredLinks(): StoredLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter corrupted entries + migratively drop entries missing shareableUrl
    // (those were created before the storage bug fix; their secret keys are lost).
    return parsed.filter(isValidStoredLink);
  } catch {
    return [];
  }
}

export function addStoredLink(link: StoredLink): void {
  if (typeof window === "undefined") return;
  const links = getStoredLinks();
  // Prevent duplicates
  if (links.some((l) => l.depositId === link.depositId)) return;
  links.push(link);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function removeStoredLink(depositId: string): void {
  if (typeof window === "undefined") return;
  const links = getStoredLinks().filter((l) => l.depositId !== depositId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

/**
 * Update a stored link's status hint.
 * Used by the auto-refund flow to mark links as "refunded" after
 * a successful on-chain autoRefund call.
 */
export function updateStoredLinkStatus(
  depositId: string,
  status: NonNullable<StoredLink["status"]>,
): void {
  if (typeof window === "undefined") return;
  const links = getStoredLinks().map((l) =>
    l.depositId === depositId ? { ...l, status } : l,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}
