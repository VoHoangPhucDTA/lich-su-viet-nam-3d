// ─── AdminTable — generic scrollable table ───────────────────────────────────

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: string;
}

interface AdminTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T) => string;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDesc?: string;
}

import EmptyState from '../shared/EmptyState';

export default function AdminTable<T>({
  columns,
  rows,
  getKey,
  emptyIcon,
  emptyTitle,
  emptyDesc,
}: AdminTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDesc} />;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.875rem',
          minWidth: '45rem',
        }}
      >
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                style={{
                  padding: '0.875rem 1rem',
                  textAlign: 'left',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  borderBottom: '2px solid var(--border)',
                  background: 'var(--bg-app)',
                  whiteSpace: 'nowrap',
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={getKey(row)}
              style={{
                background: idx % 2 === 0 ? 'transparent' : 'var(--bg-app)',
                borderBottom: '1px solid var(--border)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLTableRowElement).style.background = 'var(--accent-soft)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? 'transparent' : 'var(--bg-app)';
              }}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  style={{
                    padding: '1rem',
                    color: 'var(--text-primary)',
                    verticalAlign: 'middle',
                    fontWeight: 500,
                  }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
