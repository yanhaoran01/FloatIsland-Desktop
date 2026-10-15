/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file FusionVideoMain.tsx @description 无应用权限的保留式本地视频播放器。 @author 鸡哥 */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { I18nProvider } from '@videojs/react/i18n';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { Container, Controls, PlayButton, MuteButton, FullscreenButton, PlaybackRateButton, Time, TimeSlider, VolumeSlider } from '@videojs/react';
import { Video, VideoPlayer } from '@videojs/react/video';
import { Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import './components/fusion/fusionTheme.css';
import './styles/fusion-video.css';
const language = new URLSearchParams(location.search).get('lang') || 'zh-CN';
document.documentElement.lang = language;
void i18n.changeLanguage(language);
const token = location.hash.slice(1);
/** 保持媒体元素挂载，只通过原生媒体命令控制播放。 */
function LocalVideo() {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  return <VideoPlayer><I18nProvider locale={language}>
    <Container className="fusion-player">
      <Video src={`fusion-file://media/${encodeURIComponent(token)}`} playsInline autoPlay={new URLSearchParams(location.search).get('autoplay')!=='0'} preload="auto" onError={() => setError(true)} />
      <Controls.Root>
        <Controls.Backdrop className="fusion-player-shade" />
        <Controls.Content className="fusion-player-controls">
          <TimeSlider.Root className="fusion-player-seek">
            <TimeSlider.Track className="fusion-player-track"><TimeSlider.Buffer className="fusion-player-buffer" /><TimeSlider.Fill className="fusion-player-fill" /></TimeSlider.Track>
            <TimeSlider.Thumb className="fusion-player-thumb" />
          </TimeSlider.Root>
          <Controls.Group className="fusion-player-row" aria-label={t('fusion.media.controls')}>
            <PlayButton className="fusion-player-button" render={(props, state) => <button {...props}>{state.paused ? <Play size={17} /> : <Pause size={17} />}</button>} />
            <Time.Group className="fusion-player-time"><Time.Value type="current" /><Time.Separator /><Time.Value type="duration" /></Time.Group>
            <span className="fusion-player-space" />
            <div className="fusion-player-volume">
              <MuteButton className="fusion-player-button"><Volume2 className="fusion-player-sound" size={16} /><VolumeX className="fusion-player-muted" size={16} /></MuteButton>
              <VolumeSlider.Root className="fusion-player-volume-slider"><VolumeSlider.Track className="fusion-player-track"><VolumeSlider.Fill className="fusion-player-fill" /></VolumeSlider.Track><VolumeSlider.Thumb className="fusion-player-thumb" /></VolumeSlider.Root>
            </div>
            <PlaybackRateButton className="fusion-player-button fusion-player-rate" render={(props, state) => <button {...props}>{state.rate}×</button>} />
            <FullscreenButton className="fusion-player-button"><Maximize2 size={16} /></FullscreenButton>
          </Controls.Group>
        </Controls.Content>
      </Controls.Root>
      {error && <p className="fusion-video-error" role="alert">{t('fusion.media.codecError')}</p>}
    </Container>
  </I18nProvider></VideoPlayer>;
}
createRoot(document.getElementById('root')!).render(<LocalVideo />);
