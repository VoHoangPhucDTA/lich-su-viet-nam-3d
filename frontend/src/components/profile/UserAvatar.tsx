interface UserAvatarProps {
  fullName: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: { wh: '2rem', font: '0.75rem' },
  md: { wh: '2.5rem', font: '0.875rem' },
  lg: { wh: '3.5rem', font: '1.125rem' },
  xl: { wh: '5rem', font: '1.5rem' },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function getColor(name: string): string {
  const colors = [
    'linear-gradient(135deg, #4f6f95, #2a4b72)',
    'linear-gradient(135deg, #2a4b72, #4f6f95)',
    'linear-gradient(135deg, #4f6f95, #c29b4b)',
    'linear-gradient(135deg, #2f7a57, #266247)',
    'linear-gradient(135deg, #c29b4b, #9c7333)',
    'linear-gradient(135deg, #9f1d2d, #7d1a28)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function UserAvatar({ fullName, avatarUrl, size = 'md', className }: UserAvatarProps) {
  const s = sizes[size];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={fullName}
        className={className}
        style={{
          width: s.wh,
          height: s.wh,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '2px solid rgba(30,58,95,0.4)',
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: s.wh,
        height: s.wh,
        borderRadius: '50%',
        background: getColor(fullName),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: s.font,
        fontWeight: 700,
        letterSpacing: '0.02em',
        border: '2px solid rgba(30,58,95,0.3)',
        flexShrink: 0,
        userSelect: 'none',
      }}
      title={fullName}
    >
      {getInitials(fullName)}
    </div>
  );
}
