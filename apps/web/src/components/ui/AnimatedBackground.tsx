import React from 'react';

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      {/* Animated Saffron Aurora Blob */}
      <div
        className="absolute -top-[120px] left-[15%] w-[540px] h-[540px] rounded-full bg-gradient-to-br from-orange-500/20 via-amber-400/15 to-transparent blur-[120px] will-change-transform animate-floatBlob1"
      />

      {/* Animated Sovereign Indigo Aurora Blob */}
      <div
        className="absolute -top-[80px] right-[12%] w-[480px] h-[480px] rounded-full bg-gradient-to-bl from-indigo-500/18 via-violet-400/12 to-transparent blur-[130px] will-change-transform animate-floatBlob2"
      />

      {/* Center Subtle Breathing Glow */}
      <div
        className="absolute top-[35%] left-[50%] -translate-x-1/2 w-[700px] h-[360px] rounded-full bg-gradient-to-r from-orange-400/8 via-indigo-300/8 to-amber-300/6 blur-[140px] will-change-transform animate-floatBlob3"
      />

      {/* Isometric Diamond Grid Overlay with Shimmer */}
      <div className="absolute inset-0 bg-isometric-grid opacity-75 animate-shimmer" />

      {/* Subtle Floating Graph Network Particles */}
      <div className="absolute inset-0 opacity-25">
        <span className="particle particle-1" />
        <span className="particle particle-2" />
        <span className="particle particle-3" />
        <span className="particle particle-4" />
        <span className="particle particle-5" />
      </div>
    </div>
  );
}
