"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { getStoredLinks, removeStoredLink, type StoredLink } from "@/lib/storage";
import { useDeposit, useRefundLink } from "@/hooks/useLinkVault";
import { useRefundMultiple } from "@/hooks/useRefundMultiple";
import { LinkCard } from "@/components/LinkCard";

export default function MyLinksPage() {
  const { address, isConnected } = useAccount();
  const [links, setLinks] = useState<StoredLink[]>([]);

  useEffect(() => {
    setLinks(getStoredLinks());
  }, []);

  const { refundMultiple, busyDepositIds } = useRefundMultiple();

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Connect your wallet</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Connect to view your payment links.
          </p>
        </div>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
            <svg
              className="h-7 w-7 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">No links yet</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Create your first payment link to see it here.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
          >
            Create link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">My Links</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Track and manage your payment links. Refund expired unclaimed links anytime.
        </p>
      </div>

      <div className="space-y-3">
        {links.map((link) => (
          <LinkRow
            key={link.depositId}
            link={link}
            currentAddress={address}
            isBusy={busyDepositIds.has(link.depositId)}
            onRefund={async (depositId) => {
              await refundMultiple(depositId, () => {
                removeStoredLink(link.depositId);
                setLinks(getStoredLinks());
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function LinkRow({
  link,
  currentAddress,
  isBusy,
  onRefund,
}: {
  link: StoredLink;
  currentAddress: `0x${string}` | undefined;
  isBusy: boolean;
  onRefund: (depositId: bigint) => Promise<void>;
}) {
  const depositId = BigInt(link.depositId);
  const { data: deposit, isLoading } = useDeposit(depositId);

  if (isLoading || !deposit) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-1/4 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-6 w-1/3 rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>
      </div>
    );
  }

  const isClaimed = deposit.claimed;
  const isExpired = Math.floor(Date.now() / 1000) >= Number(deposit.expiry);
  const canRefund = isExpired && !isClaimed && deposit.sender === currentAddress;

  return (
    <LinkCard
      depositId={link.depositId}
      amount={link.amount}
      token={link.token}
      expiry={Number(deposit.expiry)}
      isClaimed={isClaimed}
      isExpired={isExpired}
      canRefund={canRefund}
      isBusy={isBusy}
      onRefund={() => onRefund(depositId)}
    />
  );
}
