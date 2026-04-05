import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button = ({ 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  className = '', 
  children, 
  ...props 
}: ButtonProps) => {
  const baseStyles = `inline-flex items-center justify-center font-bold tracking-tight uppercase transition-all duration-300 focus:outline-none disabled:opacity-50 disabled:pointer-events-none rounded-sm ${fullWidth ? 'w-full' : ''}`;
  
  const variants = {
    primary: 'hextech-gold-gradient text-hextech-blue hover:brightness-110 active:scale-95 shadow-lg',
    secondary: 'bg-hextech-blue-lighter text-slate-200 border border-white/10 hover:bg-hextech-blue-bright active:scale-95',
    ghost: 'bg-transparent text-hextech-gold/80 hover:text-hextech-gold hover:bg-white/5 uppercase tracking-widest text-[10px]',
    outline: 'bg-transparent border border-hextech-gold/40 text-hextech-gold hover:bg-hextech-gold/10 active:scale-95'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base'
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
