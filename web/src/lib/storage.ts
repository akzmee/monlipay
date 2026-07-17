/**
 * Local storage utility for tracking created links.
 * This is client-side only — no server, no database.
 * The source of truth is always the on-chain contract.
 *
 * The shareableUrl field contains the full claim URL including the
 * #fragment with the secret key. This is safe to store in localStorage
 * because localStorage is client-side only and the URL fragment is
 * never sent to any server.
 */

export interface StoredLink {
  depositId: string;
  token: string;
  amount: string; // in ether units for display
  expiry: number; // unix timestamp
  createdAt: number; // unix timestamp
  sender: string;
  shareableUrl?: string; // full claim URL (includes secret key in fragment)
}

const STORAGE_KEY = "monlipay_links";

export function getStoredLinks(): StoredLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredLink[];
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
