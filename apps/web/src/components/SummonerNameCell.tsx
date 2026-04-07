import React, { Suspense } from "react";
import Link from "next/link";
import { getAccountByPuuid, getSummonerById } from "@/app/actions";
import { Skeleton } from "@/components/ui/Skeleton";

interface NameCellProps {
  summonerId: string;
  region: string;
  initialPuuid?: string;
  initialName?: string;
}

async function NameResolver({ summonerId, region, initialPuuid, initialName }: NameCellProps) {
  // Add jitter to avoid hammering the same second of rate limit
  const jitter = Math.random() * 800;
  await new Promise(r => setTimeout(r, jitter));

  try {
    let puuid = initialPuuid;
    
    // Fallback: If puuid is missing, resolve it via summonerId
    if (!puuid && summonerId) {
      const summoner = await getSummonerById(summonerId, region);
      puuid = summoner?.puuid;
    }

    if (puuid) {
      const account = await getAccountByPuuid(puuid, region);
      if (account) {
        const displayName = `${account.gameName}#${account.tagLine}`;
        return (
          <Link
            href={`/summoner/${region}/${account.gameName}-${account.tagLine}`}
            className="text-lg font-bold text-white group-hover:text-hextech-gold transition-colors tracking-tight hover:underline underline-offset-4 decoration-hextech-gold/30 animate-in fade-in duration-700"
          >
            {displayName}
          </Link>
        );
      }
    }
  } catch {
    // Silence error to show fallback
  }

  const fallbackName = initialName || (summonerId ? `Subject // ${summonerId.slice(0, 12)}` : 'CLASSIFIED SUBJECT');
  return (
    <div className="flex flex-col gap-0.5 animate-in fade-in duration-500">
       <span className="text-lg font-bold text-slate-400/80 tracking-tight">
        {fallbackName}
      </span>
      <span className="text-[10px] uppercase font-mono text-slate-500 tracking-widest">
        Player Not Found // Try Again Later
      </span>
    </div>
  );
}

export function SummonerNameCell(props: NameCellProps) {
  return (
    <Suspense 
      fallback={
        <div className="flex flex-col gap-1.5 animate-pulse">
          <Skeleton className="h-6 w-48 bg-hextech-gold/5" variant="scan" />
          <div className="flex gap-2">
            <div className="h-3 w-20 bg-white/5 rounded" />
            <div className="h-3 w-16 bg-white/5 rounded" />
          </div>
        </div>
      }
    >
      <NameResolver {...props} />
    </Suspense>
  );
}
