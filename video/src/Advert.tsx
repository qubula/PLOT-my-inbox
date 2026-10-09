import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { SEGMENTS } from './config';
import { loadFonts } from './fonts';
import { Words } from './components/Words';
import { Intro } from './scenes/Intro';
import { MapScene } from './scenes/MapScene';
import { UiOpen, UiRead } from './scenes/Interface';
import { Decay } from './scenes/Decay';
import { Organise } from './scenes/Organise';
import { Tree } from './scenes/Tree';
import { End } from './scenes/End';
import { Soundtrack } from './Soundtrack';

const SCENES: Record<string, React.FC> = { intro: Intro, map: MapScene, uiOpen: UiOpen, uiRead: UiRead, decay: Decay, organise: Organise, tree: Tree, end: End };

loadFonts();
export const Advert: React.FC = () => (
  <AbsoluteFill style={{ background: '#F5F5F5' }}>
    <Series>
      {SEGMENTS.map(s => {
        const Scene = SCENES[s.key];
        return <Series.Sequence key={s.key} durationInFrames={s.dur}>{s.words ? <Words words={s.words} tone={s.tone} /> : <Scene />}</Series.Sequence>;
      })}
    </Series>
    <Soundtrack />
  </AbsoluteFill>
);
