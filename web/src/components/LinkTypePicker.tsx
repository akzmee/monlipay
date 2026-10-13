import Link from "next/link";
import { monadChain } from "@/config/chain";

export function LinkTypePicker({
  active,
}: {
  active: "payment" | "group" | "private";
}) {
  return (
    <nav className="mp-link-types" aria-label="Link type">
      <Link
        href="/create"
        aria-current={active === "payment" ? "page" : undefined}
      >
        <strong>Payment link</strong>
        <span>One amount, one recipient</span>
      </Link>
      {(monadChain.id === 143 || active === "private") && (
        <Link
          href="/create/private"
          aria-current={active === "private" ? "page" : undefined}
        >
          <strong>Private payment</strong>
          <span>Shielded transfer · Beta</span>
        </Link>
      )}
      <Link
        href="/create/group"
        aria-current={active === "group" ? "page" : undefined}
      >
        <strong>Group payment</strong>
        <span>One link, multiple recipients</span>
      </Link>
    </nav>
  );
}
