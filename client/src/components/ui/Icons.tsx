import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const BaseIcon = ({ size = 24, children, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const CoinIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12c0-2.4 1.6-4 3.5-4s3.5 1.6 3.5 4-1.6 4-3.5 4-3.5-1.6-3.5-4z" />
    <path d="M12 8v8" />
  </BaseIcon>
);

export const BellIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M18 16H6l1.5-2.5V11a4.5 4.5 0 0 1 9 0v2.5L18 16z" />
    <path d="M9.5 16a2.5 2.5 0 0 0 5 0" />
  </BaseIcon>
);

export const SettingsIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M19.4 15a1.2 1.2 0 0 0 .24 1.32l.05.05a1.6 1.6 0 0 1-2.26 2.26l-.05-.05a1.2 1.2 0 0 0-1.32-.24 1.2 1.2 0 0 0-.66 1.08V20a1.6 1.6 0 1 1-3.2 0v-.08a1.2 1.2 0 0 0-.66-1.08 1.2 1.2 0 0 0-1.32.24l-.05.05a1.6 1.6 0 0 1-2.26-2.26l.05-.05A1.2 1.2 0 0 0 8.6 15a1.2 1.2 0 0 0-1.08-.66H7.4a1.6 1.6 0 1 1 0-3.2h.08A1.2 1.2 0 0 0 8.56 10a1.2 1.2 0 0 0-.24-1.32l-.05-.05a1.6 1.6 0 1 1 2.26-2.26l.05.05a1.2 1.2 0 0 0 1.32.24h.02a1.2 1.2 0 0 0 .66-1.08V5.4a1.6 1.6 0 1 1 3.2 0v.08a1.2 1.2 0 0 0 .66 1.08h.02a1.2 1.2 0 0 0 1.32-.24l.05-.05a1.6 1.6 0 1 1 2.26 2.26l-.05.05a1.2 1.2 0 0 0-.24 1.32v.02a1.2 1.2 0 0 0 1.08.66h.08a1.6 1.6 0 1 1 0 3.2h-.08a1.2 1.2 0 0 0-1.08.66z" />
  </BaseIcon>
);

export const TrophyIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M8 5h8v2a4 4 0 0 1-8 0V5z" />
    <path d="M6 5h2v2a4 4 0 0 1-4 4V7a2 2 0 0 1 2-2z" />
    <path d="M18 5h2a2 2 0 0 1 2 2v4a4 4 0 0 1-4-4V5z" />
    <path d="M10 15h4v2h-4zM9 19h6" />
  </BaseIcon>
);

export const ShieldIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 3l7 3v6c0 4.2-3 7.2-7 9-4-1.8-7-4.8-7-9V6l7-3z" />
  </BaseIcon>
);

export const GamepadIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="3.5" y="9" width="17" height="7.5" rx="3.2" />
    <path d="M8.5 12.8h3M10 11.3v3" />
    <circle cx="16.5" cy="12" r="1" />
    <circle cx="18.5" cy="14" r="1" />
  </BaseIcon>
);

export const ChartIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M4 19h16" />
    <path d="M7 16v-4" />
    <path d="M12 16V8" />
    <path d="M17 16v-6" />
  </BaseIcon>
);

export const WifiIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M5 9a11 11 0 0 1 14 0" />
    <path d="M8 12a7 7 0 0 1 8 0" />
    <path d="M11 15a3 3 0 0 1 2 0" />
    <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
  </BaseIcon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M9 5l7 7-7 7" />
  </BaseIcon>
);

export const ArrowLeftIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M15 6l-6 6 6 6" />
  </BaseIcon>
);

export const XIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </BaseIcon>
);

export const CheckIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </BaseIcon>
);

export const SearchIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-3.5-3.5" />
  </BaseIcon>
);

export const CalendarIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <rect x="4" y="6" width="16" height="14" rx="2" />
    <path d="M8 4v4M16 4v4M4 10h16" />
  </BaseIcon>
);

export const CrownIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M4 17l2-10 6 5 6-5 2 10H4z" />
    <path d="M4 17h16v2H4z" />
    <circle cx="6" cy="7" r="1" />
    <circle cx="12" cy="9" r="1" />
    <circle cx="18" cy="7" r="1" />
  </BaseIcon>
);

export const FlagIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M5 4v16" />
    <path d="M6 5h9l-1.5 3L15 11H6z" />
  </BaseIcon>
);

export const SparklesIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z" />
    <path d="M5 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
  </BaseIcon>
);

export const MedalIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="14" r="4" />
    <path d="M8 3h8l-2 5h-4L8 3z" />
  </BaseIcon>
);

export const LifebuoyIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M4.9 4.9l3 3M16.1 16.1l3 3M19.1 4.9l-3 3M7.9 16.1l-3 3" />
  </BaseIcon>
);

export const PlayIcon = (props: IconProps) => (
  <svg
    width={props.size ?? 28}
    height={props.size ?? 28}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const UsersIcon = (props: IconProps) => {
  const fillColor = props.fill ?? 'none';
  return (
    <BaseIcon {...props}>
      <circle cx="9" cy="7" r="2.5" fill={fillColor} />
      <circle cx="16" cy="10" r="2.5" fill={fillColor} />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M12.5 19a4.5 4.5 0 0 1 8 0" />
    </BaseIcon>
  );
};

export const StarIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16l-5.2 2.9 1-5.8L3.6 9l5.8-.8L12 3z" />
  </BaseIcon>
);

export const UserIcon = (props: IconProps) => {
  const fillColor = props.fill ?? 'none';
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="8" r="3.5" fill={fillColor} />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </BaseIcon>
  );
};

export const BookIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 3V5z" />
    <path d="M7 5v14" />
  </BaseIcon>
);

export const ScrollIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <path d="M8 5h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7a2 2 0 0 1 2-2z" />
    <path d="M9 9h6M9 13h6" />
  </BaseIcon>
);

export const GlobeIcon = (props: IconProps) => (
  <BaseIcon {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M4 12h16" />
    <path d="M12 4a12 12 0 0 1 0 16" />
    <path d="M12 4a12 12 0 0 0 0 16" />
  </BaseIcon>
);

export default BaseIcon;
