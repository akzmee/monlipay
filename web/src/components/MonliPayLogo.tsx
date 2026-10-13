import Image from "next/image";

/** MonliPay's folded M: two ribbons meet at the envelope's center fold. */
export function MonliPayLogo({ size = 32, className }: { size?: number; className?: string }) {
  return <Image src="/brand/monlipay-mark.svg" alt="" width={size} height={size} className={className} />;
}
