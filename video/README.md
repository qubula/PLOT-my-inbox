# PLOT video

A 48 s launch video for PLOT, built in [Remotion](https://www.remotion.dev). Phone first: 4:5, 1080 × 1350.

```bash
npm install
npm run render        # out/plot-4x5.mp4 (2x supersampled, -14 LUFS)
npm run stills -- 100 300 --id=plot-4x5
```

`scripts/sync.mjs` copies the app's fonts, the tree stages from `web/js/tree.js`, the subject lines from `web/output/` and the sounds from `../Audio/`. `src/generated/cluster.json` is the real layout of the cluster "Summer Fashion Seasonal Discount Campaign", read from the running app.

The cut is timed to the music in bars (about 158 BPM, so a bar is 1.52 s). The music starts in its quiet break, so that its drop (63.8 s into the track) lands on the first frame of the map. Scene lengths are in `BEATS` in `src/config.ts`, and all on-screen copy is in `COPY`. The video shows no inbox numbers, because they differ for every user.

| Beat | What happens |
|---|---|
| Intro (6 bars) | Folders, files and emails pile onto the inbox, then the emails pour out of it at the camera. The mess is scrunched into a paper ball, the screen goes dark, and the ball drops in as the O of PLOT. The cursor clicks the O and the camera falls through it. |
| Map (9 bars) | The 4 Themes open from the centre. The camera dives Theme → Space → Cluster, and the emails take their thread colours. Labels name each level. |
| Decay (4 bars) | One email ages from newest to oldest: it fades and shrinks. |
| Organise (5 bars) | Two floating emails are selected and grouped into a new green thread. |
| Tree (4 bars) | Emails are deleted one by one, and each one waters the tree. |
| End (4 bars) | PLOT wordmark, tagline, note and credits. |

The opening's folders, files, email cards and paper ball are in `src/components/Desk.tsx`; labels are `src/components/Callout.tsx`. `src/Soundtrack.tsx` lists every sound cue and what each sound is used for.

## Credits

- Music by Musinova from Pixabay (https://pixabay.com/users/musinova-47643763/).
- Sound effects from Pixabay: riser by dbsound, water drip by freesound_community, crumpling paper by oxidvideos, pencil scribble by u_viypcpsnud.
- Sound effects made with ElevenLabs: notifications, soft pop and shimmer.
