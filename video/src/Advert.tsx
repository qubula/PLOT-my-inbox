import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { BEATS } from './config';
import { loadFonts } from './fonts';
import { Intro } from './scenes/Intro';
import { MapScene } from './scenes/MapScene';
import { Decay } from './scenes/Decay';
import { Organise } from './scenes/Organise';
import { Tree } from './scenes/Tree';
import { End } from './scenes/End';
import { Soundtrack } from './Soundtrack';

loadFonts();
export const Advert: React.FC = () => (
  <AbsoluteFill style={{ background: '#F5F5F5' }}>
    <Series>
      <Series.Sequence durationInFrames={BEATS.intro}><Intro /></Series.Sequence>
      <Series.Sequence durationInFrames={BEATS.map}><MapScene /></Series.Sequence>
      <Series.Sequence durationInFrames={BEATS.decay}><Decay /></Series.Sequence>
      <Series.Sequence durationInFrames={BEATS.organise}><Organise /></Series.Sequence>
      <Series.Sequence durationInFrames={BEATS.tree}><Tree /></Series.Sequence>
      <Series.Sequence durationInFrames={BEATS.end}><End /></Series.Sequence>
    </Series>
    <Soundtrack />
  </AbsoluteFill>
);
