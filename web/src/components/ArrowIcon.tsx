/** Shared directional icon; the surrounding control provides its accessible name. */
export function ArrowIcon({
  direction = "right",
}: {
  direction?: "right" | "left" | "up-right";
}) {
  const paths = {
    right: "M4 10h12m-5-5 5 5-5 5",
    left: "M16 10H4m5-5-5 5 5 5",
    "up-right": "M5 15 15 5M5 5h10v10",
  };
  return (
    <svg
      className="mp-arrow-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={paths[direction]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
