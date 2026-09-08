import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Keeps one bad page from taking down the console.
 *
 * React unmounts the whole tree when a render throws, so before this existed a single malformed
 * row — a report saved under an older schema, say — turned every screen into a blank white page
 * with no way back. That is survivable in development and unacceptable in front of an audience.
 *
 * Mounted with the pathname as its `key`, so navigating away remounts it and clears the error:
 * leaving the broken page is enough to recover, with no reset logic of its own.
 */
interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="p-6">
        <div className="mx-auto max-w-2xl rounded-lg border border-crit/40 bg-crit/5 p-5">
          <h1 className="text-[22px] font-semibold text-crit">This page could not be displayed</h1>
          <p className="mt-2 text-sm text-ink-2">
            Something in the data on this page was not in a shape the console expected. Every other page still
            works — use the navigation above. The details below help whoever fixes it.
          </p>
          <pre className="mt-3 overflow-x-auto rounded border border-line bg-surface p-3 font-mono text-[11px] text-ink-2">
            {error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-deep"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
