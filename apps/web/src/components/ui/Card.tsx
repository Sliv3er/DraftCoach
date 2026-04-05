import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'solid' | 'glass' | 'accent';
  status?: 'victory' | 'defeat' | 'none';
  interactive?: boolean;
  noOverflow?: boolean;
}

export const Card = ({ 
  variant = 'solid', 
  status = 'none', 
  interactive = false, 
  noOverflow = false,
  className = '', 
  children, 
  ...props 
}: CardProps) => {
  const baseStyles = `rounded-md transition-all duration-300 relative ${noOverflow ? '' : 'overflow-hidden'}`;
  
  const variants = {
    solid: 'bg-hextech-blue-light shadow-md',
    glass: 'hextech-glass shadow-xl',
    accent: 'bg-hextech-blue-lighter border border-white/5'
  };

  const statusStyles = {
    victory: 'card-victory',
    defeat: 'card-defeat',
    none: ''
  };

  const interactiveStyles = interactive ? 'hover:bg-hextech-blue-bright hover:-translate-y-1 cursor-pointer' : '';

  return (
    <div 
      className={`${baseStyles} ${variants[variant]} ${statusStyles[status]} ${interactiveStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
