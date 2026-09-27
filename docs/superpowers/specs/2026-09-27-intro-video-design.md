# ECP Hub intro video — design

Approved in chat on 27 Sep 2026 after three storyboard rounds. A 26-second product film introducing
ECP Hub, in the manner of an Apple launch film: big kinetic type carries the story, and product
shots sit between the type beats.

## Decisions

- **Audience:** attendees and clients both. One attendee's journey is the spine; no admin screens
  (dropped in round 2).
- **Visuals:** motion recreations of the real screens built from ECP Hub's own look, not screen
  captures. All data is invented — event "Horizon Summit 2026", Kuala Lumpur; attendee
  "Mei Ling Tan". Nothing from `ecphub` or any other live event appears.
- **Audio:** an original track and sound effects synthesised in code — no licensing questions,
  and picture and sound fire from one cue sheet so every hit lands on its frame.
- **Format:** 1920×1080, 60 fps, H.264 MP4 with AAC audio, about 27 s including the fade.
- **Copy:** tagline "Every event. One hub."; end card closes on "by Ecopia Events" with no URL.

## Look

- Near-black stage, white type, Ecopia orange (#F97316) only on the word that matters.
- Manrope ExtraBold headlines (the app's and the printed badges' font), up to ~280px, tracked
  tight (about -0.045em).
- The app screens stay light, as in real life, on floating phones tilted a few degrees in 3D.
- Type techniques: blur-to-sharp tracking-in, mask-line reveals, slot-machine word flips, a scan
  line that recolours text, rolling odometer numerals, full-frame slams on inverted colours,
  and letters as windows onto the film.
- Motion snaps in fast (expo out) and settles; every shot drifts slowly between cuts.

## Storyboard

120 BPM: a beat is 0.5 s and a bar is 2 s. Every cut lands on a beat.

| # | Time | Scene | Picture | Sound |
|---|---|---|---|---|
| 1 | 0:00–0:04 | Cold open | "One link." sharpens from a blur as its tracking tightens; "Your whole event." rises from a mask line, its full stop becomes an orange dot | Pad swell, sub hit on each line, riser |
| 2 | 0:04–0:06 | The invite | The dot drops into a rising phone as the WhatsApp message (template style, "Open portal" button); "It starts on WhatsApp." beside it; a thumb taps | Kick drops in, ping, tap |
| 3 | 0:06–0:08 | Word carousel | "Your ___." flips agenda / map / info / badge, one per half-second; the phone screen changes to match | Pluck arpeggio, tick per flip |
| 4 | 0:08–0:10 | Bookings | "Grab a seat." beside a session card (Leadership breakout · Hall B · 2:30 pm); Book turns to a green Booked; a giant outlined "3" rolls to "2"; an Add to calendar pill pops in | Tap, chime, tick |
| 5 | 0:10–0:12 | Check in | "Check in." in giant type; a scan line sweeps down and turns it green while a badge QR behind it flashes "Checked in"; "In a second." | Scanner beep, success chime; music drops out on the last half-beat |
| 6 | 0:12–0:14 | Type slam | "Play." "Live." "Together." fill the frame one per beat on inverted colours; the camera pulls back to reveal the words were on an LED screen | Three hard hits |
| 7 | 0:14–0:16 | Tap race | The LED in a dark venue: team lanes race upward; phones in the foreground are tapped | Full groove |
| 8 | 0:16–0:20 | Lucky draw | The LED fills the frame; names blur through a slot reel, slow down and stop on Mei Ling Tan; flash, confetti, "Grand prize" | Slowing ticks, drumroll, hit and shimmer at 0:18 |
| 9 | 0:20–0:22 | Letters as windows | "ECP Hub" fills the screen; each letter shows the film's scenes moving inside it | Groove, riser starts |
| 10 | 0:22–0:27 | End card | The letters collapse into an orange dot that becomes the Ecopia mark on the impact; wordmark, tagline, "by Ecopia Events"; fade to black | Snare roll, impact at 0:24, chord tail |

## Music

Original, 120 BPM, in C major / A minor. Bar chords: Fmaj7, G (intro, pad and filtered plucks
only) → Am7, F, C, G (groove: kick on every beat, claps on 2 and 4, off-beat hats, sidechained
bass and pad, 16th-note pluck arpeggio) → stabs on the slam → Am7 (tap race) → F held under the
lucky-draw suspense with no kick → C on the winner → G → build → Cmaj9 on the impact, ringing out.

## Build

- A sibling folder, `Dev Projects/ecphub-intro-video/`, so the app's build and lint never see it.
- Scenes are one HTML page animated by a single paused GSAP timeline (GSAP is free, including
  commercial use). Remotion was rejected: companies over three people need a paid licence.
- A Node script serves the page, drives the installed Edge through `playwright-core`, steps the
  timeline frame by frame at 1920×1080 and pipes the frames into ffmpeg.
- A second Node script synthesises the audio to WAV from the same cue sheet; ffmpeg muxes and
  loudness-normalises it (-14 LUFS).
- Deliverables: `ecp-hub-intro.mp4` and a poster frame.
