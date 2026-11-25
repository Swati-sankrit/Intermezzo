import type { ReactNode } from 'react';
import type { CandleColour } from '../library/model';
import { Avatar } from './Avatar';
import './WelcomeHeader.css';

export interface WelcomeHeaderProps {
  /** Empty or missing shows no name and no placeholder. */
  displayName?: string;
  candleColour?: CandleColour;
  /** Optional controls shown at the end of the header row, such as the settings button. */
  actions?: ReactNode;
}
export function WelcomeHeader({ displayName = '', candleColour = 'amber', actions }: WelcomeHeaderProps) {
  const name = displayName.trim();
  return (
    <header className="welcome-header">
      <Avatar candleColour={candleColour} />
      <div className="welcome-header__text">
        <h1 className="welcome-header__title">{name ? `Welcome back, ${name}` : 'Welcome back'}</h1>
        <p className="welcome-header__line">The candle is lit. Your page is waiting.</p>
      </div>
      {actions && <div className="welcome-header__actions">{actions}</div>}
    </header>
  );
}
