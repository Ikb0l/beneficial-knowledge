import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import { cardVariants } from '../../lib/animations/variants';

type CardVariant = 'default' | 'elevated' | 'glass' | 'outline' | 'gaming';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  children: ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-bg-card/88 border border-[#86a8d233] shadow-card',
  elevated: 'bg-[#1a2b4f] border border-[#8fb4e540] shadow-card-hover',
  glass: 'glass',
  outline: 'border border-[#8fb4e540] bg-[#0f1a33]/55',
  gaming: 'bg-gradient-to-br from-[#18305c] via-[#172a4d] to-[#111d3b] border border-[#8fb4e540] shadow-card',
};

const paddingStyles = {
  none: '',
  sm: 'p-[clamp(10px,2.4vw,14px)]',
  md: 'p-[clamp(12px,2.8vw,18px)]',
  lg: 'p-[clamp(16px,3.6vw,24px)]',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      interactive = false,
      children,
      className,
      ...props
    },
    ref
  ) => {
    return (
      <motion.div
        ref={ref}
        variants={interactive ? cardVariants : undefined}
        initial={interactive ? "initial" : undefined}
        animate={interactive ? "animate" : undefined}
        whileHover={interactive ? "hover" : undefined}
        whileTap={interactive ? "tap" : undefined}
        className={cn(
          'rounded-[clamp(12px,2.6vw,20px)] backdrop-blur-sm min-w-0',
          variantStyles[variant],
          paddingStyles[padding],
          interactive && 'cursor-pointer touch-feedback',
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

Card.displayName = 'Card';

// Card Header Component
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1.5 pb-4', className)}
      {...props}
    >
      {children}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

// Card Title Component - Beneficial Knowledge typography
interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ children, className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-lg font-heading font-bold text-text-primary', className)}
      {...props}
    >
      {children}
    </h3>
  )
);

CardTitle.displayName = 'CardTitle';

// Card Content Component
interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ children, className, ...props }, ref) => (
    <div ref={ref} className={cn('font-body', className)} {...props}>
      {children}
    </div>
  )
);

CardContent.displayName = 'CardContent';

// Card Footer Component
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center pt-4 border-t border-[#8fb4e533]', className)}
      {...props}
    >
      {children}
    </div>
  )
);

CardFooter.displayName = 'CardFooter';

export default Card;
