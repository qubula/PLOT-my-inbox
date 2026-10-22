// Renders both formats to out/.
//   node scripts/render.mjs                 both formats, high quality
//   node scripts/render.mjs --only=advert-4x5
//   node scripts/render.mjs --fast          1x render, for quick checks
//   node scripts/render.mjs --stills 30 200 still frames (see also scripts/stills.mjs)
//
// High quality: every frame is rendered at 2x and downscaled with a Lanczos
// filter (supersampling), so rotated cards, thin text and photo edges come out
// clean. The 16:9 version also keeps its 4K master for YouTube, which gives 4K
// uploads a higher bitrate (sharper even for viewers watching in 1080p).
// Audio is normalised to -14 LUFS, true peak -1.5 dB.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const browser = ['/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(p => fs.existsSync(p));
const extra = browser ? ['--browser-executable', browser] : [];
const run = args => execFileSync('npx', ['remotion', ...args, ...extra], { stdio: 'inherit' });
const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

const SIZES = { 'plot-4x5': [1080, 1350], 'plot-16x9': [1920, 1080] };
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const ids = only ? [only] : Object.keys(SIZES);
const fast = process.argv.includes('--fast');
const AUDIO = ['-af', 'loudnorm=I=-14:TP=-1.5:LRA=7', '-c:a', 'aac', '-b:a', '256k'];
const VIDEO = (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart'];

if (process.argv.includes('--stills')) {
  const frames = process.argv.slice(process.argv.indexOf('--stills') + 1).filter(a => /^\d+$/.test(a));
  for (const id of ids) for (const f of frames) run(['still', id, `out/stills/${id}-${f}.png`, `--frame=${f}`]);
} else {
  fs.mkdirSync('out', { recursive: true });
  for (const id of ids) {
    const [w, h] = SIZES[id];
    if (fast) {
      run(['render', id, `out/${id}.raw.mp4`, '--codec=h264', '--crf=16']);
      ffmpeg(['-i', `out/${id}.raw.mp4`, '-c:v', 'copy', ...AUDIO, `out/${id}.mp4`]);
    } else {
      // 2x master, near-lossless
      run(['render', id, `out/${id}.2x.mp4`, '--codec=h264', '--crf=8', '--scale=2', '--jpeg-quality=100']);
      ffmpeg(['-i', `out/${id}.2x.mp4`, '-vf', `scale=${w}:${h}:flags=lanczos`, ...VIDEO(14), ...AUDIO, `out/${id}.mp4`]);
      
      fs.rmSync(`out/${id}.2x.mp4`);
    }
    fs.rmSync(`out/${id}.raw.mp4`, { force: true });
  }
}
