"use client";

import { useState } from "react";

/**
 * Minimal token shape used across the app (create form, modal, bridge).
 * Both TokenInfo (config/chain) and BridgeToken (lib/bridge-types) satisfy this.
 */
export interface TokenAvatarToken {
  symbol: string;
  logoURI?: string;
}

/**
 * Deterministic gradient palette for fallback avatars.
 * Index is selected via a stable hash of the token symbol so the same
 * token always renders the same color across renders.
 */
const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-500",
  "from-indigo-500 to-blue-500",
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-violet-500",
  "from-fuchsia-500 to-purple-500",
  "from-cyan-500 to-teal-500",
  "from-emerald-500 to-cyan-500",
  "from-violet-500 to-fuchsia-500",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function gradientFor(symbol: string): string {
  return AVATAR_GRADIENTS[hashString(symbol) % AVATAR_GRADIENTS.length];
}

export interface TokenAvatarProps {
  token: TokenAvatarToken;
  /** Diameter in pixels. Defaults to 28 (matches the create-form button size). */
  size?: number;
  className?: string;
}

/**
 * Token avatar that renders the token's logoURI when present, and falls back
 * to a deterministic gradient circle with the token's first letter otherwise.
 *
 * The same component is used in:
 *   - CreateForm selected-token button (size 28)
 *   - TokenSelectModal list rows (size 36)
 *   - TokenSelectModal import preview (size 40)
 *   - Bridge page from/to token buttons (size 24)
 *
 * Image errors (broken logoURI, network failures) silently fall back to the
 * gradient so the UI never shows a broken-image icon.
 */
export function TokenAvatar({ token, size = 28, className }: TokenAvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (token.logoURI && !imgError) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={token.logoURI}
        alt={token.symbol}
        className={`rounded-full ${className ?? ""}`}
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(token.symbol)} font-bold text-white ${className ?? ""}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-label={token.symbol}
    >
      {token.symbol.charAt(0)}
    </div>
  );
}
