import type { CandleColour } from '../library/model';
import { Avatar } from './Avatar';
import './WelcomeHeader.css';

export interface WelcomeHeaderProps {
  /** Empty or missing shows no name and no placeholder. */
  displayName?: string;
  candleColour?: CandleColour;
}
export function WelcomeHeader({ displayName = '', candleColour = 'amber' }: WelcomeHeaderProps) {
  const name = displayName.trim();
  return (
    <header className="welcome-header">
      <Avatar candleColour={candleColour} />
      <div className="welcome-header__text">
        <h1 className="welcome-header__title">{name ? `Welcome back, ${name}` : 'Welcome back'}</h1>
        <p className="welcome-header__line">The candle is lit. Your page is waiting.</p>
      </div>
    </header>
  );
}
