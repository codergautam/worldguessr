import React from 'react';

/**
 * Generic React error boundary.
 *
 * React has no built-in way to stop a render/commit-phase throw from unmounting
 * the *entire* tree — once an error bubbles past the root, Next.js swaps the app
 * for its "A client-side exception has occurred" page (a full white-screen). A
 * class component with getDerivedStateFromError / componentDidCatch is the only
 * thing that can intercept that throw and render a local fallback instead.
 *
 * Props:
 *   - children
 *   - fallback : ReactNode | (error, reset) => ReactNode   (rendered on error)
 *   - onError  : (error, info) => void                     (optional side-effect)
 *   - name     : string                                    (label for logging)
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Still surface the real error (with component stack) to the console so
    // errorTracking forwards it to GA as a NON-fatal exception. Crucially this
    // message contains no "nextjs.org", so it never trips the fatal-crash
    // Discord webhook — we've converted a white-screen into a logged warning.
    try {
      console.error(
        `[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}] caught render error`,
        error,
        info?.componentStack,
      );
    } catch (_) { /* never throw from an error handler */ }
    try { this.props.onError?.(error, info); } catch (_) { /* noop */ }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error != null) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') return fallback(this.state.error, this.reset);
      return fallback ?? null;
    }
    return this.props.children;
  }
}
