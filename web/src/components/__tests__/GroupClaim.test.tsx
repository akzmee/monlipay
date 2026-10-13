import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { zeroAddress } from "viem";
import GroupPaymentClaim from "@/components/GroupPaymentClaim";
// Activity transport is covered separately; these cases exercise settlement actions.
vi.mock("@/components/GroupPaymentActivity", () => ({ GroupPaymentActivity: () => null }));
const state=vi.hoisted(()=>({
  equal:"0x1111111111111111111111111111111111111111",random:"0x2222222222222222222222222222222222222222",wallet:"0x3333333333333333333333333333333333333333",
  mode:"equal",eligible:true,open:true,claimed:false,count:3,write:vi.fn(),read:vi.fn(),queries:vi.fn(),refetch:vi.fn(),
}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams({id:"1",vault:state.mode==="equal"?state.equal:state.mode==="random"?state.random:"0x4444444444444444444444444444444444444444"})}));
vi.mock("@/config/group",()=>({resolveGroupVault:(v:string)=>[state.equal,state.random].includes(v)?v:null,isEqualGroupVault:(v:string)=>v===state.equal,supportsOpenGroupLinks:()=>true}));
vi.mock("wagmi",()=>({useAccount:()=>({address:state.wallet}),useReadContract:(q:{functionName:string})=>{
  state.queries(q);
  const values:Record<string,unknown>={getPacket:{sender:"0x5555555555555555555555555555555555555555",token:zeroAddress,total:100n*10n**18n,remaining:BigInt(10-state.count)*10n*10n**18n,expiry:Math.floor(Date.now()/1000)+86400,slots:10,requested:state.count,settled:state.count,closed:false,title:"Team rewards"},openPackets:state.open,eligible:state.eligible,claims:[state.claimed,0n,state.claimed?10n*10n**18n:0n,state.claimed],claimFee:1000n};
  return {data:values[q.functionName],isSuccess:true,isError:false,isPending:false,refetch:state.refetch};
}}));
vi.mock("@rainbow-me/rainbowkit",()=>({useConnectModal:()=>({openConnectModal:vi.fn()})}));
vi.mock("@/hooks/useLuckyTransaction",()=>({useLuckyTransaction:()=>({busy:false,error:"",run:async(work:(ctx:unknown)=>Promise<void>)=>work({wallet:state.wallet,client:{readContract:state.read},write:state.write,wait:async()=>({status:"success"}),stage:vi.fn()})})}));
beforeEach(()=>{vi.clearAllMocks();state.mode="equal";state.eligible=true;state.open=true;state.claimed=false;state.count=3;state.write.mockResolvedValue("0xabc");state.read.mockResolvedValue(1000n);});
describe("Group claim payments",()=>{
  it("shows fixed value and remaining pool, then claims directly without an oracle",async()=>{
    render(<GroupPaymentClaim/>);
    expect(await screen.findByText("Per recipient")).toBeInTheDocument();
    expect(screen.getByText("10 MON")).toBeInTheDocument();expect(screen.getByText("70 MON")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Claim my payment"}));
    await waitFor(()=>expect(state.write).toHaveBeenCalledWith(expect.objectContaining({address:state.equal,functionName:"claimShare",args:[1n,state.wallet]})));
    expect(state.read).not.toHaveBeenCalled();
    expect(state.queries).toHaveBeenCalledWith(expect.objectContaining({functionName:"claimFee",query:expect.objectContaining({enabled:false})}));
  });
  it("preserves the random draw transaction and fee",async()=>{
    state.mode="random";render(<GroupPaymentClaim/>);
    fireEvent.click(await screen.findByRole("button",{name:"Reveal my share"}));
    await waitFor(()=>expect(state.write).toHaveBeenCalledWith(expect.objectContaining({address:state.random,functionName:"requestClaim",value:1000n})));
  });
  it("does not offer another claim to a paid wallet",async()=>{
    state.claimed=true;render(<GroupPaymentClaim/>);
    expect(await screen.findByText("Your payment is complete.")).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Claim my payment"})).not.toBeInTheDocument();
  });
  it("blocks unlisted wallets in selected mode",async()=>{
    state.open=false;state.eligible=false;render(<GroupPaymentClaim/>);
    expect(await screen.findByText(/isn’t on the recipient list/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Claim my payment"})).not.toBeInTheDocument();
  });
  it("shows completion once the quota is filled",async()=>{
    state.count=10;render(<GroupPaymentClaim/>);
    expect(await screen.findByText("All payments have been claimed.")).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Claim my payment"})).not.toBeInTheDocument();
  });
  it("rejects arbitrary vaults in shared URLs",async()=>{
    state.mode="unknown";render(<GroupPaymentClaim/>);
    expect(await screen.findByText(/unrecognized contract/)).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Claim my payment"})).not.toBeInTheDocument();
  });
});
