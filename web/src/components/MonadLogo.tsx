"use client";

import Image from "next/image";
import { useTheme } from "next-themes";

/** Monad logo. Variants: "mark" (logomark), "full" (logo + wordmark), "wordmark". Auto-switches text color on theme. */
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
