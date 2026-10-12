# PLOT video

A video for PLOT, built in [Remotion](https://www.remotion.dev). Phone first: 4:5, 1080 × 1350.

```bash
npm install
npm run render        # out/plot-4x5.mp4 (2x supersampled, -14 LUFS)
npm run stills -- 100 300 --id=plot-4x5
```

`scripts/sync.mjs` copies the app's fonts, the tree stages from `web/js/tree.js`, the subject lines from `web/output/` and the sounds from `../Audio/`. It also builds the music: the stomp track is 6 two-bar phrases plus an ending, and the script repeats its phrases 3 and 4 so the music runs under the whole film and still ends on its own ending. `src/generated/cluster.json` is the real layout of the cluster "Summer Fashion Seasonal Discount Campaign", read from the running app. `public/ui/` holds screenshots of the running app in that same cluster, taken with `scripts/capture-ui.mjs`.

The opening has no music, only sound effects. The music starts when PLOT appears (`REVEAL` in `src/config.ts`), and every segment after that is a whole number of bars (140 BPM, so a bar is 1.71 s). The film is a list of segments in `SEGMENTS`: scenes, and text cards between them. A text card has nothing on screen but its words, which slam in one line per beat, so viewers never have to read and watch at once. Card copy is in `SEGMENTS`, the opening's in `COPY`. The video shows no inbox numbers, because they differ for every user.

| Segment | What happens |
|---|---|
| Intro | "We keep everything." Folders and files pile onto the inbox. "And read almost none of it." Email cards land on top of each other, faster and faster, until they cover the screen; they drop away and PLOT is underneath, as the music starts. |
| "PLOT sorts your inbox by meaning." · "Broad Themes, narrower Spaces, specific Clusters." | What PLOT is, before any of it is shown. |
| Map (8 bars) | The 4 Themes open from the centre and the camera dives Theme → Space → Cluster; the emails take their thread colours. A depth bar at the top (Themes › Spaces › Clusters › Emails) shows the current level, with the name PLOT wrote for that group; the first name is tagged "named from your emails". Labels point out a Theme, a Space, a Cluster, a thread. |
| "Click an email to read it." → the real app | An email is clicked in the same cluster and opens in the reading panel. |
| Read mode | A phrase is highlighted in yellow, with "Highlight what matters." below it (no card of its own). |
| "Old emails decay." → decay | One email ages from newest to oldest. |
| "You decide what goes where." → organise | Labels say each dot is an email and a colour is a thread; then two floating emails are grouped into a new green thread. |
| "Delete old mail. Grow your tree." → tree | Three deletes water the tree, then the rest come in a rush and it grows to full size. |
| End (3 bars) | PLOT, tagline, note and credits, over the music's ending. |

The opening's folders, files and email cards are in `src/components/Desk.tsx`, text cards in `src/components/Words.tsx`, labels in `src/components/Callout.tsx`. `src/Soundtrack.tsx` lists every sound cue and what each sound is used for.

## Credits

- Music: "Stomp Drum Percussion (Version 6, Power Up)" by bombinsound from Pixabay.
- Sound effects from Pixabay: message notification by liecio, riser by dbsound, crumpling paper by oxidvideos (cut into the card sound), pencil scribble by u_viypcpsnud.
- Sound effects made with ElevenLabs: soft pop and shimmer.
