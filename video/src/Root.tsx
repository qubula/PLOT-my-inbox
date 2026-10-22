import React from 'react';
import { Composition } from 'remotion';
import { Advert } from './Advert';
import { FPS, TOTAL } from './config';

// Phone-first: 4:5 for the LinkedIn feed; 16:9 for desktop and YouTube.
export const Root: React.FC = () => (
  <>
    <Composition id="plot-4x5" component={Advert} durationInFrames={TOTAL} fps={FPS} width={1080} height={1350} />
    <Composition id="plot-16x9" component={Advert} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
  </>
);
