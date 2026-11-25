import './WelcomeHeader.css';

export interface WelcomeHeaderProps {
  /** Arrives with the profile (Task 8). Empty or missing shows no name and no placeholder. */
  displayName?: string;
}

export function WelcomeHeader({ displayName = '' }: WelcomeHeaderProps) {
  const name = displayName.trim();
  return (
    <header className="welcome-header">
      <h1 className="welcome-header__title">{name ? `Welcome back, ${name}` : 'Welcome back'}</h1>
      <p className="welcome-header__line">The candle is lit. Your page is waiting.</p>
    </header>
  );
}
