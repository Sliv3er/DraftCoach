import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function LeaderboardsLoading() {
  return (
    <div className="relative min-h-screen pt-12 pb-24 bg-archive-dark overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-hextech-blue/10 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Header Section Skeleton */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-[1px] bg-hextech-gold/30" />
              <div className="h-3 w-40 bg-hextech-gold/10 rounded" />
            </div>
            <div className="h-16 w-[500px] bg-white/5 rounded-lg" />
            <div className="h-4 w-96 bg-white/5 rounded opacity-50" />
          </div>

          <div className="h-12 w-64 bg-white/5 rounded-lg border border-white/10" />
        </div>

        {/* Ranking List Skeleton */}
        <Card variant="glass" className="relative overflow-hidden border border-white/5 bg-white/[0.02]">
          <div className="p-8 space-y-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-12">
                  <div className="h-12 w-12 bg-white/5 rounded-md flex items-center justify-center font-black text-white/10 text-2xl">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-64 bg-hextech-gold/5" variant="scan" />
                    <div className="flex gap-2">
                      <div className="h-3 w-24 bg-white/5 rounded" />
                      <div className="h-3 w-20 bg-white/5 rounded opacity-50" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <div className="h-6 w-32 bg-white/5 rounded" />
                  <div className="h-3 w-24 bg-white/5 rounded opacity-30" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
