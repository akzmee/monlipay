import type { Metadata } from "next";
import Link from "next/link";
import { DemoVideo } from "@/components/DemoVideo";
import { ArrowIcon } from "@/components/ArrowIcon";

export const metadata: Metadata = {
  title: "Watch the demo | MonliPay",
  description:
    "Watch a Group Payment from creation to claim on Monad testnet, with English narration and captions. One link, ten recipients, equal shares.",
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
