import { useRef, useEffect } from 'react';
import { cn } from '../../lib/utils/cn';

interface PassagePanelProps {
  text: string;
  title?: string;
  compact?: boolean;
  veryCompact?: boolean;
  className?: string;
}

export function PassagePanel({
  text,
  
  compact = false,
  veryCompact = false,
  className,
}: PassagePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [text]);

  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => p.trim());

  if (!paragraphs.length) return null;

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-[#0c1222]',
        className
      )}
    >

      {/* Content */}
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 overflow-y-auto',
          'px-5 py-5',
          compact && 'px-4 py-4',
          veryCompact && 'px-3 py-3',
        )}
      >
        {paragraphs.map((paragraph, idx) => (
          <p
            key={idx}
            className={cn(
              'text-white/85 font-word antialiased',
              'leading-[1.9]',
              'text-[16px]',
              compact && 'text-[15px] leading-[1.85]',
              veryCompact && 'text-[14px] leading-[1.8]',
              idx > 0 && 'mt-5',
              compact && idx > 0 && 'mt-4',
              veryCompact && idx > 0 && 'mt-3',
            )}
          >
            {paragraph}
          </p>
        ))}
      </div>

      {/* Bottom fade */}
      <div className="flex-shrink-0 h-10 bg-gradient-to-t from-[#0c1222] to-transparent pointer-events-none" />
    </div>
  );
}
