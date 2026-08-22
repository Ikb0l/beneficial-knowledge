import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils/cn';

interface OrnamentalCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  showBismillah?: boolean;
  ornamentSize?: 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-[clamp(10px,2.4vw,14px)]',
  md: 'p-[clamp(12px,2.8vw,18px)]',
  lg: 'p-[clamp(16px,3.6vw,24px)]',
};

const ornamentSizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export const OrnamentalCard = forwardRef<HTMLDivElement, OrnamentalCardProps>(
  (
    {
      children,
      padding = 'md',
      showBismillah = false,
      ornamentSize = 'md',
      className,
      ...props
    },
    ref
  ) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          'relative rounded-[clamp(12px,2.6vw,20px)]',
          'bg-gradient-to-br from-gold-muted to-transparent',
          'border border-gold-primary/20',
          'shadow-card',
          paddingStyles[padding],
          className
        )}
        {...props}
      >
        {/* Gold ornamental corners */}
        <OrnamentCorner position="tl" size={ornamentSize} />
        <OrnamentCorner position="tr" size={ornamentSize} />
        <OrnamentCorner position="bl" size={ornamentSize} />
        <OrnamentCorner position="br" size={ornamentSize} />

        {/* Optional Bismillah header */}
        {showBismillah && (
          <div className="bismillah-header mb-3 pb-2 border-b border-gold-primary/10">
            بِسْمِ ٱللَّٰهِ
          </div>
        )}

        {children}
      </motion.div>
    );
  }
);

OrnamentalCard.displayName = 'OrnamentalCard';

// Ornament Corner Sub-component
interface OrnamentCornerProps {
  position: 'tl' | 'tr' | 'bl' | 'br';
  size?: 'sm' | 'md' | 'lg';
}

const OrnamentCorner = ({ position, size = 'md' }: OrnamentCornerProps) => {
  const positionStyles = {
    tl: 'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
    tr: 'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
    bl: 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
    br: 'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
  };

  return (
    <div
      className={cn(
        'absolute border-gold-primary/60',
        ornamentSizes[size],
        positionStyles[position]
      )}
    />
  );
};

// Arch Card variant for category selection
interface ArchCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  selected?: boolean;
}

export const ArchCard = forwardRef<HTMLDivElement, ArchCardProps>(
  ({ children, selected = false, className, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'relative rounded-xl overflow-hidden cursor-pointer',
          'bg-background-card',
          'border transition-all duration-400',
          selected
            ? 'border-gold-primary shadow-glow-gold'
            : 'border-gold-primary/15 hover:border-gold-primary/40',
          className
        )}
        {...props}
      >
        {/* Top arch decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/5 h-1 bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />

        {children}

        {/* Selection indicator */}
        {selected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gold-primary flex items-center justify-center"
          >
            <svg className="w-3 h-3 text-background-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        )}
      </motion.div>
    );
  }
);

ArchCard.displayName = 'ArchCard';

export default OrnamentalCard;
