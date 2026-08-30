import React from 'react';

interface LogoProps {
  variant?: 'full' | 'mark' | 'horizontal' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  withSubtitle?: boolean;
}

export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      {/* 4 Connecting Stems in Orange */}
      <line x1="24" y1="24" x2="11" y2="11" stroke="#ea580c" strokeWidth="4" strokeLinecap="round" />
      <line x1="24" y1="24" x2="37" y2="12" stroke="#ea580c" strokeWidth="4" strokeLinecap="round" />
      <line x1="24" y1="24" x2="12" y2="37" stroke="#ea580c" strokeWidth="4" strokeLinecap="round" />
      <line x1="24" y1="24" x2="36" y2="36" stroke="#ea580c" strokeWidth="4" strokeLinecap="round" />

      {/* 4 Satellite Outer Nodes in Orange */}
      <circle cx="11" cy="11" r="5" fill="#ea580c" />
      <circle cx="37" cy="12" r="5" fill="#ea580c" />
      <circle cx="12" cy="37" r="5" fill="#ea580c" />
      <circle cx="36" cy="36" r="5" fill="#ea580c" />

      {/* Central Core Hub in Deep Slate/Navy */}
      <circle cx="24" cy="24" r="7" fill="#0f172a" />
    </svg>
  );
}

export function LogoAppIcon({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-white border border-slate-200/80 shadow-md flex items-center justify-center p-2 ${className}`}>
      <LogoMark className="h-full w-full" />
    </div>
  );
}

export function Logo({
  variant = 'horizontal',
  size = 'md',
  className = '',
  withSubtitle = true,
}: LogoProps) {
  const getMarkSize = () => {
    switch (size) {
      case 'sm':
        return 'h-6 w-6';
      case 'lg':
        return 'h-10 w-10';
      default:
        return 'h-7 w-7';
    }
  };

  const getTextSize = () => {
    switch (size) {
      case 'sm':
        return 'text-lg';
      case 'lg':
        return 'text-3xl';
      default:
        return 'text-xl';
    }
  };

  const getSubSize = () => {
    switch (size) {
      case 'sm':
        return 'text-[7px] tracking-[0.2em]';
      case 'lg':
        return 'text-[11px] tracking-[0.25em]';
      default:
        return 'text-[8.5px] tracking-[0.22em]';
    }
  };

  if (variant === 'mark') {
    return <LogoMark className={`${getMarkSize()} ${className}`} />;
  }

  if (variant === 'icon') {
    return <LogoAppIcon className={`${className}`} />;
  }

  return (
    <div className={`flex items-center gap-2.5 group select-none ${className}`}>
      <LogoMark className={`${getMarkSize()} group-hover:scale-105 transition-transform duration-200`} />
      <div className="flex flex-col leading-none">
        <div className={`font-display-serif font-black tracking-tight ${getTextSize()}`}>
          <span className="text-slate-950">Safe</span>
          <span className="text-[#ea580c]">Ro</span>
        </div>
        {withSubtitle && (
          <span className={`font-sans font-bold uppercase text-slate-500 mt-0.5 ${getSubSize()}`}>
            RISK INTELLIGENCE
          </span>
        )}
      </div>
    </div>
  );
}
