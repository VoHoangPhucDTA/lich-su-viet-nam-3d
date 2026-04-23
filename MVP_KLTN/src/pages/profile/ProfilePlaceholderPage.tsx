import { Link } from 'react-router-dom';

export default function ProfilePlaceholderPage({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/profile/dashboard" className="text-slate-400 hover:text-white transition">← Dashboard</Link>
        </div>
        <h1 className="text-2xl font-bold mb-4">{title}</h1>
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 text-center text-slate-500">
          <p>🚧 Trang này sẽ được phát triển ở bước tiếp theo.</p>
        </div>
      </div>
    </div>
  );
}
