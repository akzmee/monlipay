"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { monadChain } from "@/config/chain";
import { shortAddress } from "@/lib/lucky";
import type { GroupActivityResponse } from "@/lib/group-activity";
import { ArrowIcon } from "./ArrowIcon";

const labels = { funded: "Pool funded", requested: "Share reserved", ready: "Share assigned", claimed: "Payment received", refunded: "Funds returned" };

export function GroupPaymentActivity({ id, vault, decimals, symbol, refreshKey }: {
  id: bigint; vault: Address; decimals?: number; symbol: string; refreshKey?: string;
}) {
  const { data, isError: error, isFetching: busy, refetch } = useQuery({
    queryKey: ["group-payment-activity", monadChain.id, vault.toLowerCase(), id.toString()],
    queryFn: async ({ signal }): Promise<GroupActivityResponse> => {
      const response = await fetch(`/api/group-activity?chain=${monadChain.id}&vault=${vault}&id=${id}`, { signal });
      if (!response.ok) throw new Error("Activity unavailable");
      return response.json();
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  useEffect(() => {
    if (refreshKey) void refetch();
  }, [refetch, refreshKey]);

  return (
    <section className="mp-group-activity" aria-labelledby="group-activity-title">
      <div className="mp-history-heading">
        <h2 id="group-activity-title">Payment activity</h2>
        <button type="button" className="mp-text-button" onClick={() => void refetch()} disabled={busy}>{busy ? "Updating…" : "Refresh"}</button>
      </div>
      {error && <p className="mp-hint" role="status">{data ? "Activity could not refresh. Showing the last update." : "Activity is temporarily unavailable. You can still use this link."}</p>}
      {!data && !error && <p className="mp-hint" role="status">Loading payment activity…</p>}
      {data && data.events.length === 0 && <p className="mp-hint">Confirmed payments will appear here. Recent transactions may take a moment to show.</p>}
      {data && !data.complete && <p className="mp-hint">More activity is still being indexed. Refresh to check again.</p>}
      {data && data.events.length > 0 && <ol>
        {data.events.map((event) => <li key={event.id} className="mp-activity-row">
          <div>
            <p>{labels[event.kind]}</p>
            <small><span title={event.address}>{shortAddress(event.address)}</span>{event.timestamp !== null && <> · <time dateTime={new Date(event.timestamp * 1000).toISOString()}>{new Date(event.timestamp * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></>}</small>
          </div>
          <a className="mp-text-link" href={`${monadChain.blockExplorers.default.url}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer" aria-label={`View ${labels[event.kind].toLowerCase()} transaction`}>
            {event.amount !== null && decimals !== undefined ? `${formatUnits(BigInt(event.amount), decimals)} ${symbol}` : "View transaction"}
            <ArrowIcon direction="up-right" />
          </a>
        </li>)}
      </ol>}
    </section>
  );
}
