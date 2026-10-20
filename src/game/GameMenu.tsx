import React from 'react';
import { Music, Swords, Droplets, Home, X, Play } from 'lucide-react';
import type { AudioPreferences } from './audio';

type Props = {
  preferences: AudioPreferences;
  changePreferences: (preferences: AudioPreferences) => void;
  wellName: string;
  canReturn: boolean;
  returnToWell: () => boolean;
  returnToTitle: () => boolean;
  close: () => void;
  audioNotice: string | null;
  saveFailed: boolean;
  replayEnding?: () => void;
};

export function GameMenu(props: Props) {
  return <div className="overlay-scrim" onClick={(event) => { if (event.target === event.currentTarget) props.close(); }}>
    <section className="game-overlay journey-menu" role="dialog" aria-modal="true" aria-labelledby="journey-menu-title">
      <header className="overlay-heading">
        <div><small>COMBAT PAUSED</small><h2 id="journey-menu-title">Journey menu</h2></div>
        <button autoFocus onClick={props.close} aria-label="Close menu and resume"><X /></button>
      </header>
      <div className="journey-menu-options">
        {props.replayEnding && <button className="journey-menu-option" onClick={props.replayEnding} data-testid="button-replay-ending">
          <Play /><span><b>Watch ending again</b><small>Replay the restoration. Your journey stays unchanged.</small></span>
        </button>}
        <button className="journey-menu-option" role="switch" aria-checked={!props.preferences.musicMuted}
          onClick={() => props.changePreferences({ ...props.preferences, musicMuted: !props.preferences.musicMuted })}
          data-testid="toggle-music">
          <Music /><span><b>Music</b><small>Original regional retro soundtrack</small></span>
          <strong>{props.preferences.musicMuted ? 'Muted' : 'On'}</strong>
        </button>
        <label className="journey-volume-control" htmlFor="music-volume">
          <span><b>Music volume</b><output htmlFor="music-volume">{Math.round(props.preferences.musicVolume * 100)}%</output></span>
          <input id="music-volume" data-testid="volume-music" type="range" min="0" max="100" step="1"
            value={Math.round(props.preferences.musicVolume * 100)} aria-label="Music volume"
            onChange={(event) => props.changePreferences({
              ...props.preferences, musicVolume: Number(event.currentTarget.value) / 100,
            })} />
        </label>
        <button className="journey-menu-option" role="switch" aria-checked={!props.preferences.battleMuted}
          onClick={() => props.changePreferences({ ...props.preferences, battleMuted: !props.preferences.battleMuted })}
          data-testid="toggle-battle-sounds">
          <Swords /><span><b>Battle sounds</b><small>Strikes, spells, impacts and victories</small></span>
          <strong>{props.preferences.battleMuted ? 'Muted' : 'On'}</strong>
        </button>
        <label className="journey-volume-control" htmlFor="battle-volume">
          <span><b>Battle-sound volume</b><output htmlFor="battle-volume">{Math.round(props.preferences.battleVolume * 100)}%</output></span>
          <input id="battle-volume" data-testid="volume-battle" type="range" min="0" max="100" step="1"
            value={Math.round(props.preferences.battleVolume * 100)} aria-label="Battle-sound volume"
            onChange={(event) => props.changePreferences({
              ...props.preferences, battleVolume: Number(event.currentTarget.value) / 100,
            })} />
        </label>
        <button className="journey-menu-option" onClick={props.returnToWell} disabled={!props.canReturn}
          data-testid="button-return-well">
          <Droplets /><span><b>Return to last well</b><small>{props.wellName} · restores health and spirit</small></span>
        </button>
        {!props.canReturn && <p className="journey-menu-note">Finish the current story choice or cinematic before traveling.</p>}
        <button className="journey-menu-option" onClick={props.returnToTitle} data-testid="button-return-title">
          <Home /><span><b>Save &amp; return to title</b><small>Keep this journey and choose another save slot.</small></span>
        </button>
        {props.audioNotice && <p className="journey-menu-note" role="status">{props.audioNotice}</p>}
        {props.saveFailed && <p className="journey-menu-error" role="alert">Your journey could not be saved. This menu stays open so you don’t lose progress. Please try again before leaving.</p>}
        <p className="journey-menu-note">Use B beside a well to heal and mark your return point. Sound starts after your first tap or key press.</p>
        <button className="journey-menu-resume" onClick={props.close}>Resume adventure</button>
      </div>
    </section>
  </div>;
}
