"use client";

import React from "react";
import { Match, MatchParticipant, getCDragonChampionIcon } from "@/lib/riot";
import Image from "next/image";

interface StatsSummaryProps {
  matches: Match[];
  puuid: string;
}

export const StatsSummary: React.FC<StatsSummaryProps> = ({ matches, puuid }) => {
  if (matches.length === 0) return null;

  const stats = matches.reduce(
    (acc, match) => {
      const p = match.info.participants.find((part) => part.puuid === puuid);
      if (!p) return acc;

      acc.totalGames++;
      if (p.win) acc.wins++;
      acc.kills += p.kills;
      acc.deaths += p.deaths;
      acc.assists += p.assists;

      const champId = p.championId;
      if (!acc.champs[champId]) {
        acc.champs[champId] = { id: champId, name: p.championName, games: 0, wins: 0 };
      }
      acc.champs[champId].games++;
      if (p.win) acc.champs[champId].wins++;

      return acc;
    },
    { totalGames: 0, wins: 0, kills: 0, deaths: 0, assists: 0, champs: {} as Record<number, any> }
  );

  const winRate = Math.round((stats.wins / stats.totalGames) * 100);
  const avgKills = (stats.kills / stats.totalGames).toFixed(1);
  const avgDeaths = (stats.deaths / stats.totalGames).toFixed(1);
  const avgAssists = (stats.assists / stats.totalGames).toFixed(1);
  const kda = ((stats.kills + stats.assists) / Math.max(1, stats.deaths)).toFixed(2);

  const topChamps = Object.values(stats.champs)
    .sort((a: any, b: any) => b.games - a.games)
    .slice(0, 3);

  return (
    <div className="bg-surface-container/30 border border-white/5 p-6 mb-8 flex flex-col md:flex-row items-center gap-10">
      {/* Win Rate Circle */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-28 h-28">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="56"
              cy="56"
              r="50"
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="56"
              cy="56"
              r="50"
              stroke="currentColor"
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={314}
              strokeDashoffset={314 - (314 * winRate) / 100}
              className={winRate >= 50 ? "text-hextech-accent-success" : "text-hextech-accent-error"}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-display font-bold text-white">{winRate}%</span>
            <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Consistency</span>
          </div>
        </div>
        <div className="text-center">
          <span className="text-xs font-bold text-slate-400">{stats.wins}W {stats.totalGames - stats.wins}L</span>
        </div>
      </div>

      {/* KDA Summary */}
      <div className="flex-1 flex flex-col justify-center border-x border-white/5 px-10">
        <span className="text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold mb-4">Performance Baseline</span>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-display font-bold text-white">{avgKills}</span>
          <span className="text-slate-600">/</span>
          <span className="text-3xl font-display font-bold text-hextech-accent-error">{avgDeaths}</span>
          <span className="text-slate-600">/</span>
          <span className="text-3xl font-display font-bold text-white">{avgAssists}</span>
        </div>
        <span className={`text-sm font-bold uppercase tracking-widest ${Number(kda) >= 3 ? 'text-hextech-gold' : 'text-slate-400'}`}>
          {kda} KDA Ratio
        </span>
      </div>

      {/* Top Champions in last 20 */}
      <div className="flex flex-col gap-4">
        <span className="text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold mb-1">Recent Signatures</span>
        <div className="flex gap-4">
          {topChamps.map((c: any) => (
            <div key={c.id} className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-sm overflow-hidden border border-white/10 relative">
                <Image
                  src={getCDragonChampionIcon(c.id)}
                  alt={c.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="text-center">
                <span className={`text-[10px] font-bold block ${Math.round((c.wins / c.games) * 100) >= 60 ? 'text-hextech-accent-success' : 'text-slate-400'}`}>
                  {Math.round((c.wins / c.games) * 100)}%
                </span>
                <span className="text-[9px] text-slate-600 uppercase font-bold tracking-tighter">({c.games}G)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
