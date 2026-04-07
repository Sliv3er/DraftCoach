import React from "react";

interface SkeletonProps {
  className?: string;
  variant?: 'pulse' | 'scan' | 'static';
}

export function Skeleton({ className = "", variant = 'scan' }: SkeletonProps) {
  return (
    <div 
      className={`
        relative overflow-hidden bg-white/5 rounded backdrop-blur-sm border border-white/5
        ${variant === 'pulse' ? 'animate-pulse' : ''}
        ${className}
      `}
    >
      {variant === 'scan' && (
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-hextech-gold/10 to-transparent shadow-[0_0_20px_rgba(196,151,85,0.1)]" />
      )}
      
      {/* Hextech Scanning Line */}
      <div className="absolute inset-x-0 h-[1px] bg-hextech-gold/20 top-0 animate-[scan_3s_linear_infinite]" />
    </div>
  );
}
