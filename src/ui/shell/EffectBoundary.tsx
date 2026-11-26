import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/**
 * Small local error boundary for one Shell effect. If the effect throws while
 * rendering, it disappears and the Tab_Bar and Tab_Panel keep working
 * (Requirement 10.10).
 */
export class EffectBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
