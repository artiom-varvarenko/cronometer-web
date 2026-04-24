import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ru } from '../i18n/ru';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className={styles.shell} role="alert" aria-live="assertive">
        <h1 className={styles.title}>{ru.errorBoundaryTitle}</h1>
        <p className={styles.message}>{ru.errorBoundaryMessage}</p>
        <button
          type="button"
          className={styles.reload}
          onClick={this.handleReload}
        >
          {ru.errorBoundaryReload}
        </button>
        <details className={styles.details}>
          <summary>{ru.errorBoundaryDetailsLabel}</summary>
          <pre className={styles.pre}>
            {error.name}: {error.message}
            {error.stack ? `\n${error.stack}` : ''}
          </pre>
        </details>
      </main>
    );
  }
}
