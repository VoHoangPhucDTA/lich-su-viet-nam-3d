import { Link } from 'react-router-dom';

export default function AdminPlaceholderPage({ title }: { title: string }) {
  return (
    <div 
      style={{ 
        minHeight: '100vh', 
        background: 'var(--bg-app)', 
        color: 'var(--text-primary)', 
        padding: '2rem' 
      }}
    >
      <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <Link 
            to="/admin/dashboard" 
            style={{ 
              color: 'var(--text-muted)', 
              textDecoration: 'none', 
              fontSize: '0.875rem', 
              transition: 'color 0.2s' 
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            ← Admin Dashboard
          </Link>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>{title}</h1>
        <div 
          style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border)', 
            borderRadius: '1rem', 
            padding: '3rem', 
            textAlign: 'center', 
            color: 'var(--text-muted)',
            boxShadow: 'var(--shadow)'
          }}
        >
          <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>🚧 Trang này sẽ được phát triển ở bước tiếp theo.</p>
        </div>
      </div>
    </div>
  );
}
