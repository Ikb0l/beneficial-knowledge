import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils/cn';
import { buttonVariants, primaryButtonVariants, pulsingButtonVariants } from '../../lib/animations/variants';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'gaming';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | 'icon';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  pulsing?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-[#20c5ff] to-[#3fd5ff] text-[#0b1020] font-bold shadow-[0_10px_24px_rgba(32,197,255,0.34)] border border-[#7fe0ff]',
  secondary: 'bg-[#1b2f58] text-[#d7ecff] border border-[#8fb4e54d] hover:bg-[#213c71] hover:border-[#9fc5f8]',
  ghost: 'text-[#d7e4fb] hover:text-white hover:bg-white/10',
  success: 'bg-feedback-correct text-white shadow-[0_10px_22px_rgba(34,197,94,0.25)]',
  danger: 'bg-feedback-wrong text-white shadow-[0_10px_22px_rgba(239,68,68,0.25)]',
  gaming: 'bg-gradient-to-r from-[#23c0ff] via-[#14aef0] to-[#0f92d6] text-white font-black shadow-[0_12px_30px_rgba(32,197,255,0.45)] border border-[#8dd9ff]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-10 px-4 text-base rounded-xl gap-2',
  lg: 'h-12 px-6 text-lg rounded-xl gap-2',
  xl: 'h-14 px-8 text-xl rounded-xl gap-3 font-bold',
  icon: 'h-10 w-10 rounded-full',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      pulsing = false,
      leftIcon,
      rightIcon,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const motionVariants = variant === 'primary' || variant === 'gaming'
      ? (pulsing ? pulsingButtonVariants : primaryButtonVariants)
      : buttonVariants;

    return (
      <motion.button
        ref={ref}
        variants={motionVariants}
        initial="initial"
        animate={pulsing ? "animate" : "initial"}
        whileHover={disabled ? undefined : "hover"}
        whileTap={disabled ? undefined : "tap"}
        className={cn(
          'inline-flex items-center justify-center font-body font-medium',
          'transition-all duration-250 ease-smooth',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'touch-feedback no-select',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            <span>{children}</span>
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
