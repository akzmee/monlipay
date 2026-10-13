import { useId } from "react";

/** Original vector envelope; its open state is tied to a completed draw. */
export function LuckyArtwork({ open = false }: { open?: boolean }) {
  const id = useId().replaceAll(":", "");
  return (
    <svg
      className={`lucky-art ${open ? "is-open" : ""}`}
      viewBox="0 0 360 270"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`${id}-face`}
          x1="75"
          y1="95"
          x2="290"
          y2="215"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#c7bcff" />
          <stop offset="1" stopColor="#7655e7" />
        </linearGradient>
        <linearGradient
          id={`${id}-edge`}
          x1="282"
          y1="100"
          x2="280"
          y2="250"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#ffadbd" />
          <stop offset="1" stopColor="#9973ff" />
        </linearGradient>
      </defs>
      <path
        d="M31 219 177 267 329 209 178 159Z"
        fill="currentColor"
        opacity=".05"
      />
      <g className="lucky-art-envelope">
        <path d="m67 93 203-36 27 17-203 37Z" fill="#d9d1ff" />
        <path d="m270 57 27 17v145l-27-16Z" fill={`url(#${id}-edge)`} />
        <path d="M67 93 270 57v146L67 240Z" fill={`url(#${id}-face)`} />
        <path
          d="m67 240 97-105 106 68"
          stroke="#d9d1ff"
          strokeWidth="1.5"
          opacity=".7"
        />
        <path
          className="lucky-art-flap"
          d="m67 93 100 69L270 57"
          fill="#e8e3ff"
          stroke="#f1eeff"
          strokeWidth="1.5"
        />
        <g transform="translate(154 145) rotate(-10)">
          <rect width="28" height="28" rx="5" fill="#332169" />
          <path d="M5 21V7l9 9 9-9v14h-4v-5l-5 5-5-5v5H5Z" fill="#d8ffac" />
        </g>
      </g>
      <g className="lucky-art-share">
        <path d="m85 28 30-7 15 16-30 7Z" fill="#d8ffac" />
        <path d="m100 44 30-7v11l-30 7Z" fill="#73b475" />
        <path d="m85 28 15 16v11L85 39Z" fill="#b5e88f" />
      </g>
      <g className="lucky-art-share">
        <path d="m277 14 23-5 12 13-23 5Z" fill="#ffb7c7" />
        <path d="m289 27 23-5v9l-23 5Z" fill="#ac5a9b" />
        <path d="m277 14 12 13v9l-12-13Z" fill="#e886b5" />
      </g>
      <path
        d="M41 155v14m-7-7h14M312 109v10m-5-5h10"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity=".4"
      />
    </svg>
  );
}
