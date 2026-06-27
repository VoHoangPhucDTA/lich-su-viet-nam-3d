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
    'linear-gradient(135deg, #8b1e1e, #6b1515)',
    'linear-gradient(135deg, #6b1515, #8b1e1e)',
    'linear-gradient(135deg, #8b1e1e, #c5a059)',
    'linear-gradient(135deg, #3D8361, #2d6b4f)',
    'linear-gradient(135deg, #c5a059, #9c7d3f)',
    'linear-gradient(135deg, #5b4b3a, #3d3226)',
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
          border: '2px solid rgba(139, 30, 30, 0.15)',
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
        border: '2px solid rgba(255,255,255,0.4)',
        flexShrink: 0,
        userSelect: 'none',
      }}
      title={fullName}
    >
      {getInitials(fullName)}
    </div>
  );
}
