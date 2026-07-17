"use client";

import Image from "next/image";
import { useTheme } from "next-themes";

/**
 * MonadLogo — reusable component for the official Monad brand mark.
 *
 * Assets live in /public/monad/ and are sourced directly from the
 * official Monad Brand & Media Kit (no third-party sources).
 *
 * Variants:
 *   - "mark"        → just the violet hexagon logomark (square aspect)
 *   - "full"        → logomark + "MONAD" wordmark (wide aspect)
 *   - "wordmark"    → just the "MONAD" wordmark
 *
 * The "full" and "wordmark" variants auto-switch between black/white
 * text based on the active theme. The "mark" variant is identical
 * in both themes (it's always violet on transparent).
 *
 * Use `inverted` to force the white-text version (e.g. over violet bg).
 */
type MonadLogoVariant = "mark" | "full" | "wordmark";

interface MonadLogoProps {
  variant?: MonadLogoVariant;
  /** Pixel size. For "mark" this is width=height; for others it's height. */
  size?: number;
  className?: string;
  /** Force the white-text version (defaults to auto from theme). */
  inverted?: boolean;
  /** Alt text for accessibility. */
  alt?: string;
  /** Priority loading (above-the-fold hero usage). */
  priority?: boolean;
}

export function MonadLogo({
  variant = "mark",
  size = 32,
  className,
  inverted = false,
  alt,
  priority = false,
}: MonadLogoProps) {
  const { resolvedTheme } = useTheme();
  const isDark = inverted ? true : resolvedTheme === "dark";

  const altText =
    alt ?? (variant === "mark" ? "Monad logo" : "Monad");

  if (variant === "mark") {
    return (
      <Image
        src="/monad/logomark.svg"
        alt={altText}
        width={size}
        height={size}
        priority={priority}
        className={className}
      />
    );
  }

  if (variant === "full") {
    // Full logo = logomark + wordmark. The Default SVG uses black text
    // (for light backgrounds), the Inverted uses white (for dark).
    const src = isDark
      ? "/monad/full-logo-inverted.svg"
      : "/monad/full-logo-default.svg";
    // Original aspect ratio is 423×80 (width:height = ~5.29:1)
    return (
      <Image
        src={src}
        alt={altText}
        width={Math.round(size * 5.29)}
        height={size}
        priority={priority}
        className={className}
      />
    );
  }

  // wordmark
  const src = isDark ? "/monad/wordmark-white.svg" : "/monad/wordmark-black.svg";
  // Original aspect ratio is 627×130 (width:height = ~4.82:1)
  return (
    <Image
      src={src}
      alt={altText}
      width={Math.round(size * 4.82)}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
