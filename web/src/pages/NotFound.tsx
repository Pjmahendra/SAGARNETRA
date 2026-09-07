import { Link } from 'react-router'
export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="font-mono text-xs uppercase tracking-wider text-ink-3">404</div>
        <h1 className="mt-1 text-3xl font-semibold">This page does not exist</h1>
        <Link to="/app" className="mt-4 inline-block text-sea hover:underline">Back to the dashboard</Link>
      </div>
    </div>
  )
}
