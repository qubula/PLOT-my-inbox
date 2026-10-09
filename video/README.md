# PLOT video

A 53 s launch video for PLOT, built in [Remotion](https://www.remotion.dev). Phone first: 4:5, 1080 × 1350.

```bash
npm install
npm run render        # out/plot-4x5.mp4 (2x supersampled, -14 LUFS)
npm run stills -- 100 300 --id=plot-4x5
```

`scripts/sync.mjs` copies the app's fonts, the tree stages from `web/js/tree.js`, the subject lines from `web/output/` and the sounds from `../Audio/`. It also builds the music: the stomp track is 6 two-bar phrases plus an ending, and the script repeats its phrases 3 and 4 so the music runs under the whole film and still ends on its own ending. `src/generated/cluster.json` is the real layout of the cluster "Summer Fashion Seasonal Discount Campaign", read from the running app. `public/ui/` holds screenshots of the running app in that same cluster, taken with `scripts/capture-ui.mjs`.

The opening has no music, only sound effects. The music starts when PLOT appears (`REVEAL` in `src/config.ts`), and every scene after that is a whole number of bars (140 BPM, so a bar is 1.71 s). Scene lengths are in `BEATS` and all on-screen copy is in `COPY`. The video shows no inbox numbers, because they differ for every user.

| Beat | What happens |
|---|---|
| Intro (6.7 s + 2 bars) | Folders and files pile onto the inbox. Then email cards land on top of each other, one, two, three, then faster and faster until they cover the screen. They all drop away and PLOT is underneath; the music starts. The camera dives through the O. |
| Map (8 bars) | The 4 Themes open from the centre. The camera dives Theme → Space → Cluster, and the emails take their thread colours. Labels name each level. |
| Interface (4 bars) | The real app in the same cluster: an email is clicked and opens in the reading panel, then a phrase is highlighted in read mode. |
| Decay (3 bars) | One email ages from newest to oldest: it fades and shrinks. |
| Organise (4 bars) | Two floating emails are selected and grouped into a new green thread. |
| Tree (3 bars) | Emails are deleted one by one, and each one waters the tree. |
| End (3 bars) | PLOT wordmark, tagline, note and credits, over the music's ending. |

The opening's folders, files and email cards are in `src/components/Desk.tsx`; labels are `src/components/Callout.tsx`. `src/Soundtrack.tsx` lists every sound cue and what each sound is used for.

## Credits

- Music: "Stomp Drum Percussion (Version 6, Power Up)" by bombinsound from Pixabay.
- Sound effects from Pixabay: message notification by liecio, riser by dbsound, water drip by freesound_community, crumpling paper by oxidvideos (cut into the card sound), pencil scribble by u_viypcpsnud.
- Sound effects made with ElevenLabs: soft pop and shimmer.
