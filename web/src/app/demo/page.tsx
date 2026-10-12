import type { Metadata } from "next";
import Link from "next/link";
import { DemoVideo } from "@/components/DemoVideo";
import { ArrowIcon } from "@/components/ArrowIcon";

export const metadata: Metadata = {
  title: "Watch the demo — MonliPay",
  description:
    "Watch MonliPay create and claim a token payment link on Monad testnet, with Lucky Links for selected groups.",
};

export default function DemoPage() {
  return (
    <div className="mp-demo-page">
      <DemoVideo />
      <Link className="mp-button mp-button-primary" href="/create">
        Create a link <ArrowIcon direction="up-right" />
      </Link>
    </div>
  );
}
