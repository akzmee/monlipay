"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A progressive enhancement: the server-rendered hero is complete without motion. */
export function HeroMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = ref.current;
    if (!hero) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const compact = window.matchMedia("(max-width: 640px)");
    let dispose = () => {};

    function configure() {
      dispose();
      if (!hero) return;
      if (reduced.matches) {
        hero.removeAttribute("data-motion");
        hero.removeAttribute("style");
        return;
      }

      const controller = new AbortController();
      const { signal } = controller;
      let frame = 0;
      let visible = true;
      let x = 0;
      let y = 0;
      const clamp = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));

      const paint = () => {
        frame = 0;
        if (!visible || document.hidden) return;
        const bounds = hero.getBoundingClientRect();
        const progress = clamp(-bounds.top / bounds.height, 0, 1);
        const distance = compact.matches ? 30 : 110;
        hero.style.setProperty("--hero-drift", `${progress * -distance}px`);
        hero.style.setProperty("--hero-grid-drift", `${progress * distance * 0.4}px`);
        hero.style.setProperty("--hero-turn", `${progress * -5}deg`);
        hero.style.setProperty("--hero-near", `${progress * -32}px`);
        hero.style.setProperty("--hero-far", `${progress * -16}px`);
        hero.style.setProperty("--hero-x", `${x * 12}px`);
        hero.style.setProperty("--hero-y", `${y * 8}px`);
        hero.style.setProperty("--hero-tilt-x", `${y * -5}deg`);
        hero.style.setProperty("--hero-tilt-y", `${x * 7}deg`);
      };

      const schedule = () => {
        if (!frame && visible && !document.hidden) frame = requestAnimationFrame(paint);
      };
      const resetPointer = () => {
        x = 0;
        y = 0;
        schedule();
      };
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) schedule();
        else {
          cancelAnimationFrame(frame);
          frame = 0;
          x = 0;
          y = 0;
        }
      });
      observer.observe(hero);
      window.addEventListener("scroll", schedule, { passive: true, signal });
      window.addEventListener("resize", schedule, { passive: true, signal });
      document.addEventListener("visibilitychange", resetPointer, { signal });
      if (pointer.matches) {
        hero.addEventListener("pointermove", (event) => {
          if (event.pointerType !== "mouse") return;
          const bounds = hero.getBoundingClientRect();
          x = clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1);
          y = clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1);
          schedule();
        }, { passive: true, signal });
        hero.addEventListener("pointerleave", resetPointer, { signal });
      }
      hero.dataset.motion = "ready";
      schedule();
      dispose = () => {
        controller.abort();
        observer.disconnect();
        cancelAnimationFrame(frame);
        hero.removeAttribute("style");
      };
    }

    configure();
    reduced.addEventListener("change", configure);
    pointer.addEventListener("change", configure);
    return () => {
      dispose();
      reduced.removeEventListener("change", configure);
      pointer.removeEventListener("change", configure);
    };
  }, []);

  return <section ref={ref} className="mp-hero" aria-labelledby="home-title">{children}</section>;
}
