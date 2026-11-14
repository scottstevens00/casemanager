import { Component, type ReactNode } from 'react'

/** Keeps one broken screen from blanking the whole app: shows the error and a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Case Manager screen error', error)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page">
        <div className="card card-body" style={{ maxWidth: 640, margin: '30px auto' }}>
          <h2 style={{ marginBottom: 8 }}>This screen hit an error</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Your data is safe — nothing was lost. Go back and try again, and tell Claude what you were doing along with the message below.
          </p>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 10, borderRadius: 8 }}>
            {String(this.state.error.message || this.state.error)}
          </pre>
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                this.setState({ error: undefined })
                location.hash = '#/today'
              }}
            >
              Back to Today
            </button>
            <button className="btn" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
