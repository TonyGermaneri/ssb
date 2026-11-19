# SSB — Super Sound Board

An 80s-console sampler, synth and sound board: drop audio files (or SFZ instruments) onto the page and each one
becomes a pad; layer them into patches with VCO slots, a mod matrix, grains and global effects. (It started life as
the *Simple* Sound Board — it outgrew the name, kept the acronym.)

**Play it:** <https://tonygermaneri.github.io/ssb/> (GitHub Pages, deployed from `main`).
**Desktop app / AU / VST3:** tagged releases on GitHub; built from [`native/`](native/README.md), which serves
this same page as the window. The app plays like the browser; the AU / VST3 render with a native engine that
follows the page, so SSB sits on a DAW track.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # vitest (knob math, SFZ, zones, modulation, tags, themes)
npm run build    # typecheck + production build
```

## Using it

- **Drop** mp3/wav/ogg/m4a/flac anywhere (or click **+**). The board, settings and header state save to IndexedDB.
- **SFZ instruments**: drop a folder (or a .zip, or the .sfz together with its samples), or use **+ → Add folder…**.
  See [SFZ](#sfz) below.
- **Click a pad** to play it (it becomes the selected sound). **☰** (or right-click) opens its control panel above
  it; ☰ again closes it.
- **Keys** `1–0`, `Q–P`, `A–L`, `Z–M` trigger pads in grid order. **Space** = PANIC, **Esc** = close panels.
- **Knobs**: drag up/down, scroll, arrow keys; **Shift** = fine; **double-click** = reset.
- **Waveform**: drag to move clip in/out. Every playing voice and grain shows on it, in its own colour.

### Sounds and patches

Two catalogs, each with card and grid views and its own tag filter, shown by the header's **VIEW** toggles
(**PATCHES**, **SAMPLES**; both on, they stack, patches above, with a split to drag between them):
- **Samples** — the sounds: the AKWF wavetables and the audio you've loaded (pads). Clicking a pad plays it and selects it: the selected sound is what
  NEW PATCH starts from and what the keys play while no patch is selected.
- **Patches** — playable instruments built from up to **3 VCO slots**, each holding a sound (as the patch's own
  copy of its settings, so editing a patch never changes the sound), plus the header knobs (volume, glide, mono/poly,
  BPM, chorus / delay / reverb, global mod matrix; MPE on / off and its bend range are the controller's and stay put)
  and its **MPE bindings** (what an MPE controller's surfaces do to it, see [MPE](#mpe)). Selecting a patch loads those
  header settings. Clicking a patch card loads it and plays it (so it sounds with its own header); **☰** (or
  right-click) loads it and shows the rack, the one place a patch is edited — its title row has the name, tags, ♥,
  **SAVE**, **REVERT**, **DUPLICATE** (the copy goes at the end of the list, and the rack shows it) and **DELETE** (then the next patch). The header's
  **new patch** button copies the patch open on a click (at the end of the list, like DUPLICATE); held for 1.5 s (a green bar fills under it) it makes a new
  patch whose first VCO is the saw wavetable.

**Saving patches**: editing a patch doesn't save it. Its VCOs, header knobs, matrix and MPE bindings play as you change
them, and a dot on the header's patch display and a lit **SAVE** (there and in the rack) say it has edits. **SAVE** keeps
them; **REVERT** drops them; choosing another patch drops them too. Until then the library (and every other SSB
sharing it) has the patch as it was saved; the app reopens with your edits still unsaved, and a plugin keeps them in
its session. Name, tags and ♥ save as they change. Built-in patches (marked **BUILT-IN** on their cards, in the rack
and in the grid's KIND column) aren't overwritten: SAVE on one makes your edits a patch of your own, with the same
name, beside it, and the built-in goes back as it was. A DUPLICATE of a built-in is yours too.

The header **◀ ▶** step through patches (in the patches' filtered order) and the keyboard (PLAY) plays the selected
patch. **♥** marks favourites on sound cards, patch cards, the rack and in the grids (♥ column); **♥ FAV** in the tag
strip shows only those.

**AKWF wavetables**: all 4,358 of [Adventure Kid's single-cycle waveforms](https://github.com/KristofferKarlAxelEkstrand/AKWF-FREE)
(Kristoffer Ekstrand, CC0) ship with SSB as **65 wavetables**, one for each of AKWF's own categories: on the first load
each becomes a **sound of the board** — the perfect waves first, then AKWF's other basic shapes, its named sets
(ELECTRIC PIANO, FM SYNTH, HUMAN VOICE, …) and the numbered mixed folders — tagged **akwf**, **wavetable** and its
category (`akwf_epiano`). A table is its category's waves end to end, each 600-frame cycle at the rate that makes it
exactly C2 and centred on zero (some AKWF cycles sit well off it, which as an oscillator is only a thump); it loops
while held. The tables take no storage of their own: their audio is made from the files that ship with SSB when one is
first played or drawn. **+ → BROWSE WAVETABLES** shows each category's waves as outlines: click one to hear it (in the plugin it plays through the DAW's track, as
everything SSB plays does), **+**
selects its table on the board at that wave (and puts the table back if you deleted it), **1 / 2 / 3** put the table,
at that wave, straight into that VCO slot of the patch; ← → step through the waves, ↑ ↓ through the categories, **PUT
BACK** restores deleted tables. `scripts/akwf.mjs` rebuilds `public/akwf` from an AKWF-FREE checkout.

**Wavetables** play as an oscillator (`src/audio/wavetable.ts`, and the native engine): a VCO on a table plays one of
its waves, chosen by **WT**, blended at the same phase into the next by **WT BLEND** — 0 % that wave, 50 % half and
half, 98 % nearly all the next; after the last wave comes the first. A route to **WT POS** in the matrix sweeps the
table (±1 = all of it, wrapping round), so an LFO, the filter envelope or an MPE slide moves through it; a route to
**WT BLEND** moves the blend itself (on the built-ins, MPE pressure does). In the sample
views (2D and ISO) a table is drawn in ISO: its waves stacked from the first at the back to the last at the front, the
one WT and BLEND make lit (and seen through what's in front of it); drag it to turn the view, as any ISO view. With
GRAIN on (or STRETCH) the table is the wave WT and BLEND pick, played as a single cycle, so the
grains read that wave. A wavetable WAV of your own (Serum's format and the tools that follow it: equal cycles end to
end, a `clm` chunk giving their length) is recognised when dropped and plays the same way, its cycles at C2. Why an
oscillator rather than the granulator at audio rate: grains are windowed and overlap two to a period, which at the pitch
rate is amplitude modulation with sidebands of its own and a comb, and blending by moving POS between cycles splices
them out of phase; reading two cycles at one phase and crossfading is exact and keeps the pitch the playback rate's.
Boards from before 0.14 move onto the tables once: every patch layer on an AKWF wave plays its category's table at that
wave (the same cycle, so the same sound), the waves leave the board except any you'd renamed, changed or starred, which
stay as sounds of yours on their table at their wave, and the tables take the waves' place.

**Built-in patches**: 127 of them, made of AKWF waves (each layer its wave's table, at that wave), installed right
after the tables and tagged **factory** plus what they are (bass, lead, pad, keys, pluck, bell, mallet, strings,
brass, winds, choir, organ, chip, fx, drone, texture) and how (vco, fm, ring, grain, sync, cloud, loop, lfo, wheel,
velocity, aftertouch, mono, glide, …). There are the classic
VCO workflows — detuned unison, octave and fifth stacks, sub oscillators, PWM by crossfading two pulse widths, FM and
ring modulation between slots, an LFO at audio rate in RATIO mode — and Granulator III on single cycles:
- **grain sync**: GRAIN at half of C2, following the keys, puts two grains in every period of the note, so it plays in
  tune and PITCH moves a formant instead of the note; a PITCH route with an opposite GRAIN route sweeps it (SYNC
  SCREAMER LEAD, VOCODER VAGABOND LEAD, FORMANT SURFER LEAD, TALKBOX BASS);
- **CLOUD** choruses one wave into an ensemble or scatters it (GLACIER SHEET PAD, OCTAVE SHIMMER PAD, WIND CHIMES
  CLOUD); **LOOP** stutters (TAPE STUTTER LOOP, NEBULA DRIFT PAD); grain **FM** rings (GRAIN FM BELLWORKS); **VOID**
  crackles (GEIGER COUNTER FX); SPREAD and SPRAY widen (SUPERSAW FROM ONE).

Most answer the mod wheel (vibrato, a formant, a wobble's rate), velocity and aftertouch. They were played as they're
played — a poly patch as a four-note chord, a mono one a note at a time, at full velocity, effects on — measured in the
page (K-weighted loudness, BS.1770) and level-matched to about −16 LUFS with peaks under −7 dBFS
(`src/lib/factoryLevels.ts`), so at the default levels a chord stays well clear of clipping (the plugin's engine
measures the same within a dB). Boards that installed them louder are brought down once, keeping any layer you changed
in proportion. AKWF tables start at volume 0.4 for the same reason. They start dry: the header's chorus, delay and
reverb mixes at 0 (each patch's effects are voiced, so turning a mix up gives that patch's room or echo). Edit, rename
or delete them; SAVE keeps edits as a patch of your own (see Saving patches, above). **+ → RESTORE
BUILT-INS** puts back any AKWF wavetable or built-in patch you've deleted. A board from 0.5 keeps its nine factory patches as
they are, under their new names (POLY SAW is SUPERSAW SUNRISE, FM PIANO is TINE MACHINE EP, …), and gains the rest;
boards from before the AKWF waves first lose the old generated SAW WAVE … NOISE sounds, their patches moving to the
AKWF waves.

### VCO slots + rack

The **rack** under the header shows the selected patch's three slots as tabs (**1 2 3**, each named after its sound,
its LED lit while it sounds, MOD on a silent modulator), one at a time with its sound's full panel across the width.
A sound dragged over a tab opens it, and dropped there fills that slot.
- **Fill a slot** by dragging a sound card by its ⋮⋮ grip (or a grid row by its ⠿) into it, or pressing **1 / 2 / 3** on the card or in the grid's 1 2 3 columns (the number lights while the sound
  sits in that slot, and pressing it again takes it out; the previous sound is replaced). With no patch selected this
  starts one.
- **REMOVE** empties a slot.
- **Prompt a wave** (with a sound model downloaded; in a browser tab, Stable Audio 3 Small Music or MusicGen Small): the field under a slot's bar asks the
  VCO's sound model (its **☰ › Sound model**, beside GROW — the same one its garden grows with) for a clip from a few
  words (*a warm sustained cello note, C3*; *glass harmonica, airy*), and the clip becomes that slot's sound: trimmed,
  faded and normalised, tuned from its pitch when it holds a note, added to the board tagged `vco`. **➤** (or Enter)
  sends the words as typed; the **automation button** beside it has the word model write them out first — a fuller
  caption, and for a model that sings, the words to sing. The line under it shows the model and what was sent. Choosing
  another model in ☰ takes effect at once (a clip the old one made, not yet in, is let go). No conversation, and nothing
  downloads from here (a model not yet downloaded says so; **Download** in ☰ fetches it); ■ stops it. With no patch selected this
  starts one.
- **VCO 1** is the main voice. VCOs 2–3 have **MIX / MOD** (heard, or a silent modulator only), **TRACK / FIXED**
  (follow the played key keeping TRANS / FINE, or always play NOTE) and **LEVEL**.
- **Tuning** (the **ET** chip, on every VCO): equal temperament, or **adaptive just intonation**, which retunes that
  VCO to each chord you hold: pure fifths and thirds, while the keyboard stays close to equal temperament. See below.
- **PLAY** (beside the tuning chip) turns a VCO's panel into a performance page: the clip big over its XY pads, in
  the theme's colours (each VCO its own), with a light show behind them all. Drag the reticle anywhere (notches on the
  edges mark where it sits); double-click a pad to reset it; ⚙ has its options.
  - **The big view** is played like a pad: left / right is where in the clip the grains fire (POS), up / down how loud
    (on a wavetable, left / right moves through its waves instead: WT, and WT BLEND between them). The clip is drawn as
    a bar graph, the grains as diamonds where each is reading, and brackets top and bottom mark where the LFO has moved
    the firing point. Its corner chip picks the view (2D, or a live SCOPE / BARS / SPECTRO under the crosshair, the TV
    stretched to the view's shape); **GRAIN ON / OFF** switches grains and **GL ON / OFF** the shaders.
  - **GRAIN**: up / down the grains' size (small and fast at the top; at the bottom one grain as long as the whole
    sample, or a wavetable's wave); left / right how much of each grain's turn it sounds — 1 % at the far left (mostly
    silence between grains), all of it at the right (LENGTH). Time runs out along a spiral groove: a dash is a grain
    sounding, a gap silence, the one just fired lit. Its ⚙: **FREE / SYNC** (SYNC: the heights are tempo divisions, two
    bars down to a 32nd, shown as notches up the right edge, the top band left free for smooth fast grains), the grain
    **MODE**, **MPE PITCH / MPE GRAIN** (a note's sideways bend bends its pitch, or moves where its grains fire, over
    half the clip each way) and **ATTACK** (a percussive grain to an even one).
  - **LFO**: sweeps where the grains fire forward of the position, never behind it — left / right how far (far left:
    off), up / down how fast (tempo divisions). It is the layer's LFO 2, routed one-sided to POS. The pendulum swings
    as the firing point does, its ghosts the last swing, the arc over it the sweep's range. Its ⚙: the LFO's shape.
  - **FILTER · REVERB**: up / down the reverb; left / right the filter, bypassed in the middle, a low-pass closing to
    the left, a high-pass opening to the right. The sliced horizon is the filter's response, the ripples under it the
    reverb. Its ⚙: reverb SIZE / DECAY / **DAMP** (the tail darkens as it decays) and the filter's RES.
  - **PITCH · RING**: fine pitch (±2 semitones) in the middle; coarse toward the edges (×2 at the top corners,
    stopped half-way, backwards below, ×2 backwards at the bottom corners); the right also brings in the ring
    modulator, up / down setting its carrier with the pitch. Each needle points the way the sample plays where it
    stands: right at its own pitch, tipping down towards ×2, up where it stops, left backwards; the haloed ones are the
    ring's side (they shake as it plays), the lit line plays what the crosshair plays. Its ⚙: **FREE / SCALE** (SCALE
    snaps the pitch to the scale chosen under it, from 34).
  - **TEXTURE**: the grain cloud's scatter — left / right **SPRAY** (each grain thrown up to 2 s from where it should
    fire), up / down **DETUNE** (the grains split, left lower and right higher: a shimmer that widens). The grains are
    pollen in a strand: in step with no spray, flung about with it, parted into a low strand and a high one by detune.
    Its ⚙: VARY (VARIATION), SPREAD, DENSITY (CLOUD) and FLUX. Needs GRAIN on.
  - **ECHO**: the VCO's own delay — left / right its time (20 ms to 1.5 s, catching on the tempo's divisions, the ticks
    along the floor), up / down its feedback. The taps march away, each fainter by the feedback. Touching it gives an
    echo with no MIX some; double-click turns it off. Its ⚙: MIX, TIME, FDBK.
  - **TONE** (wide, under the others): the VCO's EQ — left / right tilts it darker (bass up, treble down) or brighter,
    up / down pushes or scoops the mids; flat in the middle. A comb of light stands on the EQ's curve. Its ⚙: BASS,
    MID, TREBLE.
  - PERFORM's ⚙ (bottom right): **PHASE** (the right channel up to 30 ms later than the left: a mono sample made wide)
    and **COARSE / FINE** tuning (the sample's own key, ±12 semitones and ±100 cents, under PITCH / FINE, so the pitch
    pad's reset keeps a sample you've tuned).
  - **Shaders**: one WebGL2 canvas runs behind all three VCOs' pads at once. Each pad has its own effect, driven by its
    VCO's live audio (level, wave, spectrum) and by what the pad is set to — PERFORM: SPECTRAL / STARFIELD / LIQUID;
    GRAIN: NEBULA / PULSAR / MOIRÉ; LFO: TIDE / AURORA / VORTEX; FILTER · REVERB: HORIZON / CAUSTIC / PLASMA; PITCH ·
    RING: WARP / RIPPLE / KALEIDO; TEXTURE: POLLEN / SILK / DUST; ECHO: TUNNEL / SONAR / MIRROR; TONE: PRISM / EMBER /
    TIDEPOOL — and the light crosses the borders: halos bleed between pads, each pad's rim glows
    as it plays, light runs along threads from each PERFORM view to its pads, and trails drift out of a pad over its
    neighbours. Every pad's ⚙ has a **SHADER** section: **GL ON / OFF** (for every pad), the style, and **AMT**, **GLOW**
    (bloom, and the halo on its neighbours), **TRAIL** (feedback) and **SPEED**, shared by that kind of pad in every VCO
    and kept by the page (not the patch). Off, or without WebGL2, the pads draw their pictures alone.
  - **VOYAGE** (VCO 1's PERFORM ⚙ › PLAY MODE): the PLAY view goes full screen as a technicolor ship bobbing through
    a field of rocks, and its working parts are the pads — all 24, the same settings, each VCO a section in its own
    colours — and each VCO's **GARDEN** (a strip of step lamps set into the foot of its window). The BOW (VCO 1): VIEWPORT (PERFORM), NOSE SPINNER (GRAIN), PERISCOPE (LFO), CRYSTAL DOME (FILTER · REVERB),
    SPIRAL HORN (PITCH), BUBBLE JETS (TEXTURE), WHISKER AERIAL (ECHO), KEEL FIN (TONE). MIDSHIPS (VCO 2): BRIDGE WINDOW,
    PADDLE WHEEL, SWING LANTERN, SONAR BUBBLE, CANDY STACKS, FIZZ PORTS, GRAMOPHONE, SIDE WING. The STERN (VCO 3): STERN
    PORTS, PROPELLER, RUDDER, LAVA DOME, EXHAUST PIPES, BUBBLE WAKE, SPRING AERIAL, TAIL FIN. Drag across a part as across
    its pad; double-click resets it; right-click opens its ⚙. Each kind of part shows its pad the same way: windows hold
    the clip, the level as liquid and the playhead; rotors turn with the grain rate, their blades as wide as LENGTH;
    swingers swing with the LFO; domes ripple with the reverb, tinted warm (low-pass) to icy (high-pass); funnels'
    stripes run with the pitch (backwards, stopped) and puff smoke rings with the ring mod; vents bubble with SPRAY and
    split into two colours with DETUNE; aerials ring once per echo, fading by the feedback; fins' stripes warm or cool
    with the tilt, the middle band swelling with the mids. The GARDEN strip is the GARDEN pad without its circles:
    the picked ring's steps as a row of lamps (its hits lit, the step playing bright, a bar sweeping on to the next), a
    pip per ring and a seed lamp at the end, green while the garden grows; the word playing shows on hover; drag ←→ its STEPS and
    ↑↓ its HITS, double-click for the next ring, right-click for its PROMPT and the rest. Every other part has two green
    badges (on its corner while you're over it, always while on; or in its right-click settings), as the PLAY pads'
    buttons below: the sprout is its **GROW**; the other turns on its **LFO** and opens its panel beside it (a right-click
    turns it on or off). Each VCO's chip in the HUD has its **◀ GROW ☰ ▶**, as its bar in PLAY. The ship steadies
    while you're at its controls.
    Rocks drift by, each meant for one VCO (in its colours) and carrying a sound from the samples list as it's filtered.
    One that passes near its VCO's tractor port (the top of the bow's and the stern's domes, the bottom of the sonar
    bubble) is beamed in and becomes that VCO's wave, crossfaded into what's sounding (**XFADE**); a click on a rock
    beams it in from anywhere. A port then rests for **GAP**; the magnet on a VCO's chip turns its beam off. A VCO
    whose garden grows catches **pods** instead: its next clip, early. **FIELD** is how thick the field is, **FX** and
    **TRAILS** how much light and film, **STEADY** stops the bob. The sky is all shader: a screenprinted nebula, a
    striped sun, oil-wheel blobs, parallax stars and rocks, rainbow poster outlines round the ship, beams and wakes
    leaving hue-shifting trails, then a misregistered three-strip split, halftone, grain, gate weave and dust.
    **PADS** (or Esc) goes back.
    **COCKPIT** (beside STEADY) puts you in the pilot's seat: the era's cockpit round you, the same sky through its
    windscreen (out of focus behind the glass), stars streaking past and the rocks coming at you. Every VCO's controls
    are on the dash — its 15 pad axes and the garden's STEPS and HITS, 51 in all — built the way the era would have
    built them: knobs, throttles, sliders, cranks and valve wheels to wind, chains to pull, a stick for PITCH, nixie or
    flip digits for the garden, and patch leads you drag from jack to jack for the stepped ones (LFO RATE and ECHO time
    on the tempo's divisions, GRAIN under SYNC). A control reads its pad, so one an LFO moves turns by itself. Its
    screens show what the PLAY pads draw, its gauges the VCOs' levels; a rock meant for an open intake is beamed down
    into that VCO's intake on the dash once it's near (or click it). Over it all: light shafts with dust turning in
    them, film grain, scanlines, interference and the era's vignette and tint. The HUD gets out of the way — it comes
    back with the pointer at the very top or bottom edge. Every decade has its own: the 50s' steam-age brass flight
    deck (a mahogany switchboard of frayed leads overhead, pull-chains hanging in front of the glass, oxblood leather,
    green televisors, valve wheels, steam off the sill pipe); the 60s' psychedelic eye (an almond windscreen in op-art
    bands, lava-lamp sliders, flower consoles of jelly knobs round a petal wheel, mandalas and diamonds); the 70s'
    walnut and harvest-gold hauler (chicken-head selectors overhead, amber CRTs, chrome T-handle throttles, a hi-fi
    tuning dial for POS); the 80s' neon wedge (vector CRTs, a HUD and a sliced sun on the glass, lit faders, a neon
    patch bay); the 90s' candy-and-chrome bubble (see-through plastic pods over circuit boards, chrome selectors); the
    00s' jelly pod (gel everything, a ball-chain pull, a lime orb of knobs round a round screen, a wet floor); the 10s'
    flat cards with 45° long shadows; the 20s' frosted-glass cards under an aurora; and the 30s' steel and carbon
    (guarded toggles, a throttle quadrant, a side-stick, Earth's limb under the glass).
    **EXTERIOR** goes back outside.
    **A ship for every decade**: the timeline over the caption (or ‹ ›) picks the era — each ship built to match its cockpit — the 50s'
    steam-age atomic saucer (riveted iron and brass, copper pipes, green-glowing portholes, a three-pane bridge,
    steam), the 60s' psychedelic eye-ship (op-art candy lacquer, an almond eye for a bridge, mandalas, diamonds,
    daisies), the 70s' weathered industrial hauler (painted plating, stencilled cargo containers, an amber-lit wedge
    bridge, heat-stained nozzles), the 80s' neon black wedge (a laser grid, chrome bead lines, neon edges), the 90s'
    ray-traced chrome and candy-plastic cruiser (circuit boards glowing through), the 00s' jelly pod, the 10s' flat
    poster liner with its long shadows, the 20s' frosted-glass nomad and the 30s' stainless deep-space ship (hex heat
    tiles, weld seams, harsh sun, Earth-light beneath). Outside, the sky, the air and the film are the cockpit's own:
    the same light shafts and dust, grain, interference and tint. Each is its own hull with the same 27
    parts placed and named its own way, in its own colours, and its own sky: pulp print with a ringed planet,
    screenprint bands, airbrushed nebulae and a gas giant, a synthwave grid, a dithered warp field, aqua gloss and
    bokeh, flat planets with long shadows, dark-mode mesh gradients, or black space over the Earth's limb — each with
    the film, print or screen it would have been seen on. The HUD dresses for the era too. (lib/voyage/eras/: an era is
    a plan of its parts, its palettes and sky, and a hull component.)
  It's the same settings as the knobs (GRAIN, LENGTH, BACK, RING, filter, reverb, PITCH / FINE, SPRAY, DETUNE, delay,
  EQ): PLAY again shows them.
- Each list has one bar: its tag filter (a drop-down), a description field, **≈ SIMILAR**, card size and **CARDS** /
  **GRID**; both lists open as grids.
- The header's **VIEW** group has three toggles for what's under the header: **RACK**, **PATCHES** and **SAMPLES**
  (one always stays on). With the rack, the lists go beside it: they start at a third of the window; drag the divider
  to resize them (double-click = 33%). Patches and samples together stack, patches above; drag the split between them
  (double-click = half and half). Each list's own bar shows it as
  **CARDS** or a **GRID** (each keeps its own) and sizes the cards (− 100% +).
- Each panel section has a **fold** triangle (top right) that shrinks it to its title; folds are shared by every
  panel and saved.

### Adaptive just intonation

Equal temperament's thirds beat; fixed just intonation's are still, but only in one key. Adaptive just intonation
(AJI) gets still chords in every key by tuning each chord as it's played. C E G becomes +4 −10 +6 cents, centred on
equal temperament, so the notes barely move from one chord to the next, and what does move hides under the new note.
It listens to the keys you hold, with the pedal and HOLD, so it needs at least two notes.

| Mode | |
| --- | --- |
| **ET** | Equal temperament. The default. |
| **AJI 5-LIMIT EASED** | Pure fifths and thirds, eased for a moment where they conflict. For anything. |
| **AJI 5-LIMIT STRICT** | Pure fifths and thirds whatever it takes; notes step further on hard changes. |
| **AJI 7-LIMIT** | Adds natural sevenths (7:4, 31 cents flat) to dominant chords. Best on sustained chords at DEPTH 90 % or more; busy part-writing can lurch. |
| **AJI TONAL CENTRE** | Finds the music's harmonic centre: chords near it are purest, far ones less so, so keys get a character. |

**DEPTH** runs from equal temperament (0 %) to the full tuning (100 %). Each VCO has its own mode and depth, and FINE
and TRANS still apply. VCOs a fifth or an octave apart each get the same tuning, so a stack stays parallel. A FIXED VCO
takes the chord's tuning for its note when the chord has that note. Mixing modes is a sound of its own: an AJI VCO
over an ET one beats gently as chords change. Under an ET VCO, a DEPTH of 60–70 % sits best. FM between VCOs wants the
same mode on both, or the ratio moves with the chord. Clicked pads stay in equal temperament.

Each VCO's live signal (after its own envelope and filter) is a mod-matrix source (**VCO 1–3** = slots 1–3): route
VCO 2 → pitch for FM, → volume for AM, → cutoff for audio-rate filter sweeps. VCOs are full sounds, so SFZ instruments
and grain clouds work as oscillators too. Note-offs, STOP, choke and PANIC treat the patch as one group.

### AI patch maker

**✦** in the header's PATCH group opens a conversation with an AI model that designs patches with you: describe a
sound ("a glassy FM bell that blooms slowly") or ask about the selected patch, and it works with the board through
tools:

| Tool | What it does |
|---|---|
| `list_sounds` / `list_patches` | finds waves, samples and patches, ordered by likeness to a description (the semantic search) |
| `read_patch` | a patch in the compact form the built-ins are written in: each slot's sound and only the knobs that differ |
| `create_patch` / `update_patch` | makes or changes a patch: everything checked against the knobs' real ranges first (unknown names refused with suggestions, numbers clamped and reported), one undo step, and the patch selected so you can play it |
| `delete_patch` | asks you first (a setting) |
| `render_patch` | plays a note offline and silently, and hands the model its measurements (level, pitch, brightness, envelope times, harmonics, noise, clipping) and two pictures: the waveform with a zoom on a few cycles, and a spectrogram |
| `sound_models` / `load_sound_model` / `unload_sound_model` | which **sound models** there are, which is loaded and downloaded; load or switch one (asking you before anything downloads), or free its memory |
| `make_sound` | briefs the loaded sound model to generate a clip from a caption, which becomes a sample on the board (below) |

- **Providers** (**Settings**): **Anthropic** (Claude; an API key), **OpenAI** (an API key), or **LM Studio** on this computer
  (no key; turn its server's CORS on, and load a model that does tool calling — with vision, for the pictures). Each
  provider keeps its own endpoint, key and model; **LIST** asks it which models there are, **TEST** sends a tiny request.
  Keys stay in this computer's browser storage, never in the board, its exports or a plugin's saved session.
- **Conversations** are saved; **★** keeps one for good (the 30 most recent unstarred ones are kept). A conversation
  stays with the provider and model it began with.
- **Prompt caching** (Anthropic): the instructions and tools never change, so they are read from the cache after the
  first request (5-minute or 1-hour lifetime, a setting), and the conversation's tail is cached as it grows. **📌** on
  one of your messages makes it a cache checkpoint (up to two), so a long session with pictures stays cheap to
  continue. Each reply shows its tokens: at full price, read from the cache, written to it, and output. OpenAI
  caches by itself; LM Studio reuses its own context.
- Claude runs with adaptive thinking (**EFFORT**, and its summary shown or hidden) and, on the models that have it,
  a server-side fallback when a request is declined. OpenAI runs through its Responses API, so its reasoning models
  (gpt-5.5, gpt-6…) use tools with **REASONING** set, their reasoning summary shown, and nothing stored on OpenAI's
  side; a setting the model doesn't take (temperature on a reasoning model) is left out rather than failing the
  request. Local models that write a tool call into their text (Qwen3.5 does, in its thinking) still get it run.

**Sound models** (a VCO's **☰ › Sound model**, where they're picked, downloaded and deleted — the agent starts with the one picked there last; the app and the plugin — a browser tab runs Stable Audio 3 Small Music and MusicGen Small): text-to-audio models the agent briefs
to generate sound effects, foley, ambiences, loops and notes, as sub-agents it can load and switch itself. SSB runs
them on this computer with [audio.cpp](https://github.com/0xShug0/audio.cpp) (on the GPU: Metal on a Mac), in a helper
process every bundle carries (`Contents/Helpers/audiocpp_server`), so a model's memory, or a crash, stays out of the
DAW. Nothing to install: pick a model and press **DOWNLOAD + LOAD**.

| Model | Download | Good for | Output |
|---|---|---|---|
| [MOSS-SoundEffect v2](https://huggingface.co/OpenMOSS-Team/MOSS-SoundEffect-v2.0) (default) | 4.0 GB | detailed sound effects and foley; about a minute a clip | mono 48 kHz, ≤ 30 s, Apache-2.0 |
| [Stable Audio 3 Small Music](https://huggingface.co/stabilityai/stable-audio-3-small-music) | 1.7 GB | loops at a BPM, notes, pads, textures; seconds a clip | stereo 44.1 kHz |
| [Stable Audio 3 Small SFX](https://huggingface.co/stabilityai/stable-audio-3-small-sfx) | 1.7 GB | quick stereo effects | stereo 44.1 kHz |
| [Stable Audio Open 1.0](https://huggingface.co/stabilityai/stable-audio-open-1.0) | 5.3 GB | the original: samples and loops | stereo 44.1 kHz, ≤ 47 s; gated (accept its licence, paste a Hugging Face token) |
| [ACE-Step 1.5 Turbo](https://huggingface.co/ACE-Step/Ace-Step1.5) | 10.1 GB | music with **singing**: it sings the lyrics given (50+ languages), or hums and oohs | stereo 48 kHz, ≤ 60 s, MIT; about 12 GB of memory |
| [MusicGen Small](https://huggingface.co/facebook/musicgen-small) | 660 MB | instrumental phrases and grooves from a description; no singing. Runs in SSB itself (transformers.js, one core): 5 s in about 20 s | mono 32 kHz, ≤ 30 s; **CC-BY-NC 4.0, non-commercial only** |

The Stable Audio models are under the Stability AI Community License. MusicGen isn't an audio.cpp model: SSB downloads its ONNX files the same way and runs it in the page, in a
worker; loading it unloads the helper's model, and the reverse (one at a time), and a stopped MusicGen clip loads it
again. Its weights are for non-commercial use.

In a **browser tab** two models run, in the page: **Stable Audio 3 Small Music** (the default there) and MusicGen Small.
Stable Audio 3 Small Music runs in its browser form: a 4-bit ONNX export
([lsb/stable-audio-3-small-music-onnx](https://huggingface.co/lsb/stable-audio-3-small-music-onnx), 640 MB, pinned to a
revision) on ONNX Runtime Web, on the GPU through WebGPU where the browser has it (10 s of stereo in about 2 s on an
M-series Mac), else on one CPU core (3 s in about 20 s). Same id as the app's, so a VCO's ☰ choice and its garden carry
between the app and a tab; up to 30 s a clip there; the decoder adds a touch of noise of its own each time, so a seed
brings back the music, not every sample. SSB fetches a tab's model files from the Hugging Face Hub into the browser's
storage for the site (the Cache API), with progress; a stopped download keeps the files it finished, and the browser is
asked to keep them rather than clear them when space runs short. Browsers clear a site's storage anyway at times (low disk, Safari's
week without a visit, "clear site data"): a model you had in this browser — downloaded, or whose clips are on the board —
that is still the one picked comes back by itself on the next visit, downloading again with its progress in a toast, and
a prompt asked of it meanwhile waits for it. A model never had there is never fetched unasked; a VCO's status line says
which it is (downloaded, loaded, downloading, not downloaded), and **Delete files** in ☰ means it stays gone. ACE-Step is the BF16 package: audio.cpp's
Q8 one quantises its planner, which then writes a different song. You keep typing short prompts: with ACE-Step as a
VCO's ☰ model, the prompt's automation button (and the garden) has the word model write four lines to sing about the
prompt — or the garden's caption — and ACE-Step sings them (10 s clips; a garden's AVOID words for voices let go; with
no word model the prompt's own words are sung); **➤** sings the words as typed. **☰ › LYRICS › OWN WORDS** (advanced)
takes the words from you instead, and ☰ shows the words sung last. The agent's make_sound takes `lyrics` too. The **MODEL** field is a combobox: pick one, or
paste the Hugging Face URL of another GGUF (a MOSS-SoundEffect, Stable Audio or ACE-Step model for audio.cpp). Before anything
downloads it says how much, and how much memory the model takes while loaded; **DOWNLOAD + LOAD** asks once more, shows
progress, and **CANCEL** stops it (a download resumes later). Models go to
`~/Library/Application Support/WaveContour/SSB/sound/models` (**DELETE FILES** removes one). One model is loaded at a
time, shared by every SSB in the same app or DAW; **UNLOAD** frees its memory. **TEST** generates a short clip and plays
it; the header shows **♪** and the model while one is loaded.

The agent sees which models there are and which is loaded, picks the loaded one, or loads another when it clearly fits
better (a model not yet downloaded asks you first, with its size). Each clip comes back trimmed, faded and normalised as
a new sample tagged `ai`, `generated` and the model; a clip that holds a steady note gets that note as its root (and fine
tune) and in its name, so it plays in tune from the keys; then the agent builds on it and renders it like any patch.
**▷** on a clip in the conversation plays it. Over MCP the same tools use the same settings.

**MCP server** (AI patch maker › **Settings › MCP server**, off until you turn it on; the app and the plugin, not a browser tab): the same tools
for an agent outside SSB — Claude Code, Claude Desktop, Cursor, anything that speaks MCP — working on the board SSB
shows. Two ways in, with copy-ready commands in the settings:
- **HTTP** (Streamable HTTP) at `http://127.0.0.1:6280/mcp`, with a bearer token: local only, requests from web pages
  refused. `claude mcp add --transport http ssb http://127.0.0.1:6280/mcp --header "Authorization: Bearer <token>"`
- **stdio**, through the `ssb-mcp` command SSB installs (`~/Library/Application Support/WaveContour/SSB/bin/ssb-mcp`):
  `claude mcp add ssb -- "<that path>"`. It finds the running SSB by itself (`--list`, `--port N` to choose one).

SSB's window (in a DAW, the plugin's editor) has to be open while an agent works: the tools run there. Deleting asks
you in SSB first (ASK BEFORE DELETING). Several SSBs with MCP on take ports 6280, 6281, …; the ✦ button's LED shows
it's on.

Contract tests against the real APIs: `SSB_AI_LIVE=1 npx vitest run src/lib/ai/providers.live.test.ts`, with
`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` set and LM Studio's server up (`LMSTUDIO_URL`).

### Prompt garden

**GROW** in the rack's header (beside MPE and PLAY) gets a whole set going in one press: every VCO with a sound starts
growing, and each empty one first gets a prompt of its own — a random idea (*dreamy marimba, through old tape*) that the
word model writes out as a fuller caption, so it's different each press — a clip from it (from the sound model picked
last, if it's downloaded; else SKETCH), its **GRAIN** on, and a random **LOOPS** (2–12) and **XFADE** (30 ms – 4 s).

Each VCO can regrow its own sample while it plays. Its bar (its tab's, or its column's in PLAY) has its own **XFADE**,
**OFFSET** and **LOOPS** knobs (in PLAY, its **VOL** too), then **◀ GROW ☰ ▶**: **GROW** — the automation icon — turns
growth on (green; while a clip is being made it fills as its progress bar), **◀ ▶** step back and forth through the
clips it has grown (stitched in at once), and **☰** holds the models: the **Sound model** (pick, download, delete; a Hugging Face token for a gated
one), the words to **AVOID** (the negative prompt), and the **Word model**. After them **↻** (in PLAY, while it grows: the clip ready goes in at once, or a new one is made now), **⏸**,
which pauses its growth (the clip playing loops on), and **💾**, which saves the clip playing into the samples (tagged
`generated`).

- **The GARDEN pad** (in PLAY, beside TONE) shows the VCO's **rings** of words (adjectives, nouns, verbs, textures,
  instruments, places, your own), each turning a Euclidean rhythm, HITS spread over STEPS. The bright ring is on the
  pad: left / right its **STEPS** (1 to 32), up / down its **HITS**; a double-click picks the next ring. Every new clip
  is one step of all of them: a ring that hits moves on to its next word (CYCLE), a random one (RANDOM) or a neighbour
  (WALK); between hits it HOLDs its word or DROPs out. The words make the caption — "eerie trolls echoing in a mithril
  mine". Its **⚙** has the rest: the PROMPT, the rings (add, remove, kind, LOCK, MUTE, ROTATE, CYCLE / RANDOM / WALK,
  HOLD / DROP), BACK, PAD STEP, REUSE and the SEED.
- **The words come from a word model** (a VCO's **☰ › Word model**: one for all VCOs): a tiny language model — SmolLM2 360M (365 MB) or
  135M (140 MB), Apache 2.0, run in SSB by transformers.js on WebAssembly in a worker, offline once downloaded. Type a
  prompt — the VCO's wave prompt, or the GARDEN pad's ⚙ › PROMPT — and it lists words of each ring's kind for it, which
  become that ring's words as each list comes ("in the depths of moria and in the misty mountains" → trolls, elves,
  mages, misty, echoing, in a mithril mine…). LOCKed rings keep theirs. A list takes a few seconds per ring kind; the
  clip already made from the old words is let go. In the app and the plugin it downloads into SSB's models folder; in a
  browser tab, into the browser's cache.
- **AVOID**: a clip whose caption asks for one of the words it avoids gets it anyway — monks chanting aren't steered
  off "speech, vocals" for that clip.
- **Growing**: once the VCO sounds, the next clip is made in the background — Stable Audio 3 Small (8 steps, seconds)
  by default, which must be downloaded (AI settings › SOUND MODEL); SKETCH, a little synth that plays the words, needs
  nothing and is the fallback where the chosen model can't run (an app-only model in a browser tab). After **LOOPS** passes of the clip (2 s at least) the new one is **stitched**
  in with an equal-power crossfade (**XFADE**, up to 10 s: longer than a loop, several loops
  of the old clip and the new overlap; the next swap waits for it to finish) — the note never stops. **OFFSET** pushes
  a VCO's swaps back by that many loops, so VCOs with the same LOOPS don't all swap together. The new clip starts at
  once, from its start, and the two play on top of each other for the whole XFADE (grains: a second grain stream on
  the new clip under the first). A single-cycle wave or an SFZ zone picks the new clip up on its next note.
- **In PLAY**, with SHADERS on, the prompt playing shows behind that VCO's pads: by default (SCROLL) as a line, in
  order, gliding slowly across the screen (each VCO's at its own height); with DRIFT each word drifts on its own current,
  kicked by the audio. Either way in film-stock colours with an anamorphic streak, lens ghosts, colour slipping apart, halation,
  grain and a little gate weave. A new prompt's words fade in one by one as the old ones go. PERFORM's ⚙ › GARDEN WORDS
  turns them off, picks SCROLL or DRIFT, and sets AMT, FLARE and AGE (how old the lens and film are).
- **Pad LFOs**: each PLAY pad (PERFORM too) has a small automation button beside its ⚙. A click turns it on (green) and
  opens its **LFO** panel on the pad's face, micro faders over the picture: **SHAPE** (top to bottom CIRCLE, EIGHT,
  SQUARE, TRIANGLE, LINE, morphing from one to the next between them), **ASPECT**
  (taller down, wider up; the middle 1:1), **FREQ** (how fast it goes round, 50 s to 8 Hz) and **AMP** (how far from the
  centre). It's drawn as part of the picture: a comet gliding round the shape in the pad's colour, its tail behind it,
  throwing off sparks, a soft ripple where a snapping pad's setting steps (the settings still snap where the pad snaps:
  the LFO pad's tempo divisions, the echo's, a scale's notes). Left alone, that's all a pad shows: its crosshair, path,
  centre and bright buttons fade out, and come back under the pointer, while you drag and while its panel is open (on
  the ship, each part an LFO moves gets the comet too, its marker and badges fading the same way); dragging the pad (where
  no fader is, panel open or not) moves the centre. Past an edge it's held at the edge, so a big AMP squares off. **×**
  closes the panel and the LFO keeps running; **OFF** turns it off and closes it (or right-click the button: a right-click turns it on or off, without the panel), leaving
  the pad at its centre. Its moves are heard by both engines but aren't edits: they don't mark the patch edited, save
  or make undo steps (the faders and the centre are, and are kept with the patch).
- **The pads grow too**: each pad's **GROW** button (🌱, left of the LFO's; on the ship, a sprout badge) turns it on: at
  each new clip that pad (with its LFO on, the LFO's centre) steps somewhere new — its x and y — a seeded walk of up to PAD STEP (the GARDEN pad's ⚙) from
  where it is, so the same seed and step move it the same way. The move starts OFFSET loops after the clip comes in
  (wrapped to land before the next one; OFFSET 0: with it) and glides over XFADE, as the clips crossfade. They're the
  pads' own writes, so the knobs and crosshairs follow; a garden move never turns an ECHO on.
- **It loops, sometimes**: everything follows from the SEED and the step, so cycling rings come round again, and with
  **REUSE** a caption that comes up again plays the clip it made then. **BACK** is the chance a step returns to an
  earlier clip instead. Every take is also a sound in the list, tagged `garden`; the latest 6 keep their audio.

The garden is saved with the patch slot. In the plugin the engine stitches on its own as the VCO's new audio arrives.

### Semantic search

Each list's bar has a description field, **≈ SIMILAR** and, on the patches', **MAKE**:
- **A description** ("airy choir", "dark gritty bass") orders the list by how near each sound or patch is to it, as you
  type: its name and tags (AKWF's short names spelt out: `epiano` → electric piano) and words made from its settings
  (slow attack, dark, plucked, grain cloud, vibrato, wobble, glide, detuned unison, reverb…). A word it shares exactly
  counts a little extra, a kind of instrument (pad, bass, bell, choir…) more. ✕ or Esc goes back to the board's order.
- **≈ SIMILAR** (or **≈** on a grid row) orders it by likeness to the selected sound or patch: its settings (each
  standardised over the board), what it sounds like (its spectrum in bands at the harmonics of C2: a wave's harmonics,
  a sample's FFT across its clip) and its words. How alike shows on the cards (≈) and in the grid's **SIM** column.
- **MAKE** (or Enter) doesn't find a patch, it searches for settings: the patches nearest the description are blended,
  the nearer the more, each setting along its knob (times and frequencies by ratio; grain and filter settings only from
  patches with the same kind), starting from the nearest one's VCOs and modes. Then the description's own words push
  it: **DARKER / BRIGHTER**, **SLOWER / FASTER ATTACK**, **LONGER / SHORTER**, **WIDER / DRIER**, **MORE MOTION / STILLER**,
  **GRITTIER / CLEANER**, **HEAVIER / LIGHTER**; a sound it names outright (choir, organ, flute) can take VCO 1. The
  result loads as the **candidate** (★ in the header): play it, edit it in the rack; its bar under the header shows what
  it was made from and what the words pushed, with **REROLL** (another blend of the nearest few), **SAVE** (onto the
  board) and **DISCARD** (back to the patch before). Until it's saved it isn't on the board: not stored or exported,
  and ⌘Z doesn't undo its edits.

The words are embedded by [Model2Vec](https://github.com/MinishLab/model2vec)'s **potion-base-8M** (MinishLab, MIT;
static embeddings distilled from BAAI's bge-base-en-v1.5), which runs in the page: its WordPiece tokenizer, then the
mean of its tokens' vectors. It ships in `public/models` as int8 (7.7 MB, `scripts/model2vec.mjs`), so search works
offline in the browser, the app and the plugin alike, and the board's 4,500-odd sounds and patches are embedded in a
fraction of a second as they arrive (after the board loads, an import, a new patch) and again after they change. As
in rolidrummer: each text is embedded once, a few synth words are spelt out before they're embedded ("plucky", "fat",
"glassy"), similarity is a dot product of unit vectors, and words and settings stay apart until the ranking.
`src/lib/semantic/semantic.test.ts` checks what descriptions bring to the top of the built-in patches.

### Starting up

Every launch starts in the **VCO rack**, alone: the patches and the samples put away (**VIEW → PATCHES** and
**SAMPLES** bring them back; a plugin instance reopens as it was left).

### Tags

A pad's TAGS field holds comma-separated tags (chips in the panel). Each list's **tag filter** is the drop-down at the
start of its bar (it says ALL, or what's picked and how many that leaves): its menu lists every tag with how many carry
it; click tags to filter (AND) — the menu then shows only tags that co-occur with the selection, with counts for what
remains. **Right-click** a tag to hide everything carrying it instead (the
chip turns red and struck through, counting what it hides; click it again to bring them back). **ALL** clears both. Imports are tagged automatically with where
they came from: `dropped, <folder>`, `sfzinstruments, <repo>`, `gm, <set>, <family>`, `dirt-samples, <bank>`,
`url, <host>`, or `imported, <board>` — plus `sfz` or `sample`.

### Big boards

The card view is virtualised (Vuetify `v-virtual-scroll` over rows sized to the window and pad scale), so only the
rows on screen exist in the DOM; grid mode (canvas-datagrid) handles very large lists natively.

A board can have thousands of sounds (sample packs, SFZ libraries), so nothing walks all of them on an edit. Each sound and patch
sits under a small proxy of its own (`src/lib/tracked.ts`) that reports writes anywhere inside it: a knob turn marks
that one sound changed, and saving and undo re-serialise only what changed (undo's snapshots share every unchanged
sound's JSON). In the AU / VST3 the native engine holds only the sounds it may be asked to play — what the keyboard
plays, the pads MIDI notes reach, and what was clicked lately, with the VCOs each layers — so a sync, and the DAW
session, stay small; clicking a sound the engine hasn't got waits for it to arrive.

### Per-pad panel

PLAY (vol, pan, level by key, repeat, choke) · TUNE (pitch, fine, speed + TAPE/STRETCH) · WAVETABLE (WT, WT BLEND;
on a wavetable) · KEYS (root note, velocity
amount, bend range) · CLIP (START, LOOP, L.END, END) · ADSR (+ key scaling) · FILTER (LP/HP/BP, and Granulator III's nine types with
WIDTH; key tracking) · FILTER ADSR (+ key scaling) · GRAIN (Granulator II: grain rate and key tracking, pos, spray, scan, window, spread, random pitch / rate, flux / void, FM;
Granulator III: CLASSIC / LOOP / CLOUD modes, skew, density, reverse, variation, detune, per-note random pitch) · FX (EQ, RING, DELAY and REVERB as one block) ·
MODE (STOP / RESTART / STACK / HOLD) · MIDI LEARN · MATRIX · PRESETS (save / load / copy / paste) · RESET ·
duplicate · delete.

- **RPT**: `1` = once, `N` = N times, `0` = loop forever.
- **CLIP** has a sampler's four markers: **START** and **END** (where the sample starts and stops), and inside them
  **LOOP** and **L.END**, the loop. A note plays from START into the loop and goes round it RPT times (∞: while
  held), then plays on through the *tail* (L.END → END) and stops; released while looping at ∞, it leaves the loop for
  the tail (and stops at END, however long its release). With LOOP and L.END at their defaults (the clip's own ends)
  the clip loops whole, as before. On the waveform, START / END are the solid markers with flags at the top (drag the
  top half), LOOP / L.END the dashed green ones with flags at the bottom (drag the bottom half). They apply to a
  sample played on tape: GRAIN, STRETCH, wavetables and SFZ zones (which have their own loops) keep START..END.
- **TAPE**: pitch and speed both change playback rate, like a sampler. **STRETCH**: granular; speed changes length, pitch stays put.
- STOP re-press, HOLD release and MIDI note-off run the ADSR release and let FX tails ring. PANIC / choke / RESTART cut instantly.
- **K>VOL**: level by key, dB an octave from ROOT (±3). **KEY** on the ADSR and the FILTER ADSR: higher notes run them
  faster (at 100 %, twice as fast an octave up), as Granulator III's Key > Env.
- **FILTER**'s type menu has SSB's LP / HP / BP (Web Audio's biquads) and **Granulator III's filter**: two 12 dB
  state-variable stages, as LP 12, LP 24, LP+HP, LP+NO, NOTCH, NO+NO, HP+NO, HP 12 and HP 24. **WIDTH** puts the second
  stage that many semitones from the first (LP+HP, LP+NO, NO+NO, HP+NO); its NOTCH is Granulator III's own, a true notch
  at RES 1 that takes the lows down a little below that and turns into a resonant bump above it. Its left and right
  sides follow an LFO's STEREO apart. **KEY**: the cutoff follows the note from ROOT (100 %: an octave an octave).

### Modulation matrix

Sources: LFO 1, LFO 2, MOD WHEEL (CC1), AFTERTOUCH (poly + channel pressure), VELOCITY, KEY (octaves from the pad's
ROOT, so KEY → PITCH at 100 % adds an octave per octave), RANDOM (−1…1, drawn for each note), PITCH BEND, TIMBRE (CC74),
FILTER ENV (the pad's filter ADSR, 0–1, whatever its AMOUNT: a second envelope), VCO 1–3.
Destinations: pitch, cutoff, resonance, volume, pan, grain pos, grain size, skew / xfade, variation, detune, scan speed
(× 1 + the route: up to three times as fast, and backwards below −100 %), the pad's LFO 1 / 2 RATE (±36 semitones) and
AMOUNT (added to its AMOUNT knob; a pad matrix only — an LFO doesn't drive itself, and two LFOs only one way),
delay mix, reverb mix, WT POS (a wavetable's position, ±1 = the whole table), WT BLEND (added to the WT BLEND knob,
held to 0–100 %).
The **GLOBAL** matrix (header MATRIX button) applies to every sound and its LFOs run freely; each pad's matrix
(panel MATRIX button) applies to that pad and its LFOs restart per note. Pitch bend always bends pitch by the
pad's BEND range. Negative volume modulation from an LFO is a tremolo that never boosts.

### Tempo, sync, sustain

LFOs can **SYNC** to note divisions (4 bars … 1/32, dotted, triplets) and the global delay has a **SYNC** switch.
Tempo comes from the **BPM** knob (INT) or incoming **MIDI clock** (EXT); MIDI Start restarts the global LFOs.
LFO shapes: sine, triangle, square, saw up, saw down, sample & hold, smooth random, and Granulator III's **RAND**
(random steps four times a cycle, glided). MIDI CC64 is a sustain pedal for keyboard play and HOLD pads.

Granulator III's LFO additions: **HZ / SYNC / RATIO** (RATIO runs it at a multiple of the note's frequency, from
middle C at the pad's ROOT; it is audio rate, so try it on GRAIN POS or the cutoff), **AMOUNT**, **STEREO** (0–180°
between its left and right: the grains' and Granulator III's filter's two sides each follow their own), **QUANT**
(steps), and, for a pad's LFOs, the **PHASE** each note starts them at (0° / 90° / 180°, or FREE).

**HLD** (header, by POLY / MONO) is Granulator III's latch for keyboard play: released keys keep sounding; the next
note played with no key down lets the latched ones go, and notes added while keys are down join them.

### MIDI pad mapping

**LRN**: each pad's learned note (LEARN in its panel). **AUTO**: notes map to pads in grid order starting at **BASE**
(default C2 = 36, the usual drum-pad start).

### SFZ

An .sfz file becomes one instrument pad (marked **SFZ**) whose zones map key × velocity ranges to samples. Clicking
the pad plays its ROOT note; with the pad selected, **PLAY** mode (MIDI or computer keys) picks zones per note, pitched
from each region's key centre. MIDI-triggered pads pass velocity through, so velocity layers work there too.
The panel shows a zone map (keys across, velocity up) that lights as notes sound.

Supported:
- structure: `<control>` (default_path, note_offset, octave_offset, set_ccN, set_hdccN), `<global>/<master>/<group>/<region>`
  inheritance, `#define` (shared across includes), `#include` (relative to the main file) — anywhere on a line, in
  reading order (a macro can be redefined per region, and include paths can use macros); `../` paths above the .sfz
- mapping: sample, key / lokey / hikey, lovel / hivel, locc / hicc, pitch_keycenter, pitch_keytrack, transpose, tune,
  seq_length / seq_position (round robin), lorand / hirand, sw_last / sw_default (default articulation)
- playback: volume, amplitude, pan, offset, end, loop_mode, loop_start / loop_end, ampeg_attack / hold / decay /
  sustain / release, trigger=release with rt_decay
- generators: `*sine`, `*saw`, `*square`, `*triangle`, `*noise`, `*silence` (band-limited looped wavetables)
- CC opcodes: volume / amplitude / pan / pitch / tune / cutoff / resonance `_onccN` (live), locc / hicc gating
- filter: fil_type, cutoff, resonance, fil_keytrack, fil_keycenter, fil_veltrack, fileg_* (the region's filter
  replaces the pad's)
- LFOs: v1 amplfo_ / pitchlfo_ / fillfo_ (freq, depth, delay) and v2 lfoN_ (freq, wave, delay → pitch, cutoff,
  volume, amplitude, pan)

Sample offsets are converted using each file's own sample rate (read from WAV / FLAC / Ogg headers). Not supported
yet: pitch EG, keyswitching while playing, CC-driven EG / LFO parameters, effects busses.

A .zip containing `board.json` still imports as a board; any other .zip is unpacked like a dropped folder.

### Library

**+ → Browse library…** fetches free, CORS-enabled collections straight into the board (no download step):
- **SFZ instruments** — the [sfzinstruments](https://github.com/sfzinstruments) GitHub org (70+ instruments). Pick an
  instrument, then one of its .sfz files; only the samples that .sfz uses are fetched (the size is shown first).
  Samples an .sfz names wrongly (case, a missing default_path) are found in the repo by their path's tail.
- **GM soundfonts** — all 128 General MIDI instruments from
  [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (FluidR3_GM or MusyngKite), one MP3
  every 3 semitones, mapped as an SFZ.
- **Drum banks** — [tidalcycles/Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples) (218 banks); each file
  becomes a pad.
- **URL** — any .sfz (samples fetched next to it), audio file or .zip; GitHub "blob" page links are rewritten to raw.

### Grain clouds

GRAIN's **ON** switch plays the pad as a cloud of grains, with the engine of Robert Henke's **Granulator II**
(Max for Live), ported from its voice patch. Each note runs two grain streams, left and right, each a phasor at the
**GRAIN** frequency (0.25–150 Hz): a grain starts every time it wraps and another half a period later, and each lasts
one whole period, so two always overlap and the window is a sine (the square root of a Hann). GRAIN follows the
keyboard (**G<KEY**, from the pad's ROOT) and so does the sample's pitch (**T<KEY**): low GRAIN is a slow, smooth
cloud; high GRAIN is a buzz that plays in tune with the keys. With T<KEY at 0 the note only moves the buzz, so the
sample's tone stays put like a formant.

- **POS** where the grains read; **P<KEY** moves it 1 % of the clip per semitone. **SPRAY** offsets each grain by up
  to that many ms (SYM, or only RIGHT / LEFT of POS), **SLOPE** keeps most offsets near POS.
- **SCAN** (switch): from each note, POS travels **S.DIST** of the clip, **S.TIME** 100 % at real time (200 % half
  speed), along **CURVE**, then stays.
- **SHAPE** steepens the window's edges up to a square half a period wide; STD / FALL / RISE / NOIZ picks the whole
  sine, its falling or rising half, or noise.
- **SPREAD** pulls the left and right grain rates apart (up to two octaves), **G<RND** lets GRAIN wander up to
  ±25 semitones, **T<RND** gives each grain its own pitch.
- **FLUX** gives each grain a random level; **VOID** drops a share of them, keeping **RESID** of their level.
- **FM** (switch) swings where the grains read with a sine at **FM HZ** (following the keys by **FM<KEY**), by up to
  ± **FM AMT** × 0.02 ms.

**MODE** adds the engines of Robert Henke's **Granulator III**. **CLASSIC** is Granulator II's, as above. **LOOP** plays
a segment one grain long, then the next from wherever POS (with SCAN, SPRAY and VARIATION) has got to: **XFADE**
crossfades each into the next (0 cuts hard), **REVERSE** is the chance a segment plays backwards. **CLOUD** layers
**DENSITY** grains a side (2–20, fixed when the note starts), the i-th 1 + √i grains long, so they start staggered and
drift apart; CLOUD sums its grains, so more of them is louder.

- **SKEW** leans CLASSIC's window: below 50 % a grain peaks at once and dies away, above it swells to an abrupt end.
- **VARIATION** scales four random amounts, drawn per grain: **V.POS** starts it up to that many ms later (× VARIATION²),
  **V.SIZE** changes its length by up to ± that many semitones, **V.PITCH** its pitch (CLOUD only), **V.VOL** its level
  (from 1.75 × that many dB quieter to a quarter of it louder).
- **DETUNE** pitches the left grains down and the right ones up; **N<RND** gives each note its own random pitch.
- **S.LOOP** starts SCAN over at S.DIST instead of stopping; **S.KEY** makes it faster for higher notes (an octave up,
  twice as fast).

Everything random is off to start with, as in Granulator II: SPRAY and the random amounts are what turn short grains
into noise. The mod matrix reaches GRAIN POS and GRAIN (in semitones, like Granulator II's Grain<LFO), and SKEW / XFADE,
VARIATION and DETUNE (Granulator III's SHAPE, VARIATION and SPREAD targets), each read as a grain starts. Grains
render sample by sample, an AudioWorklet in the page and the same code in the plugin's engine.

The waveform follows what you hear (the output's timestamp, not the scheduler's clock) and shows every playing
instance in its own colour (hue by note, brightness by velocity) with a label: a playhead for tape / stretch / SFZ
voices, and for clouds each grain over the part of the sample it plays, at its pan (left up, right down), as tall as
it is loud, hue-shifted by its pitch, notched when reversed, fading out after it ends.

Its view picker (top right; on the SCOPE, the set's channel plate) chooses what it
shows. Three views draw what the sound's voices play, live (post-filter, summed — as a VCO feeds the matrix; in the
plugin the engine sends it ~30 times a second):

- **SCOPE** (the default): a 1960s set — a phosphor trace with persistence and bloom, held still on the note's period,
  behind a curved, vignetted, scan-lined tube in a walnut cabinet. Its front panel's tiny knobs set **BLOOM**,
  **CONTRAST**, **TRAILS** and **TINT** (a 60s TV's tint: green to purple). Drag, scroll or double-click them.
- **BARS**: a 90s spectrum analyser — LED segments that jump and fall, with peak caps that hang.
- **SPECTRO**: a spectrogram, RX-style: time scrolling left, log frequency up, loudness as heat.

**2D** and **ISO** show the sample (a wavetable shows its waves in ISO, see Wavetables). **ISO** is isometric, an
action RPG's camera: the floor turned 45° and seen from 30° up, so its grid runs 2:1 across the screen both ways, and
the display grows taller to hold it. **Drag** it to turn the camera (across: around the floor; up and down: how
steeply it looks down) and **double-click** to put it back; every ISO view shares the angle. The wave stands as a wall
on the floor — a stereo sample's left at the back and its right at the front — the clip and the grain lie on the
floor, grains stand where they play at their side's depth, and the playhead is a lit curtain across it. In **2D**,
with GRAIN on, dragging edits the grain: the highlight is the stretch one grain plays from POS; drag its middle to
move POS, its sides to set its length (GRAIN), or anywhere else to put it there. Shift-drag moves the clip (in 2D the
clip markers' flags along the top still grab them too).

### Grid mode

**GRID** in a list's bar (each list has its own) switches it to a spreadsheet (canvas-datagrid, loaded on first use).
Click a row to select that sound, **☰** shows its full control panel above the grid (☰ on that row again, or Esc,
puts it away), click **▷** or double-click a read-only cell to play, **Delete** or **Backspace** removes the selected
rows (after asking; ⌘Z brings them back), double-click an editable cell (name, tag, mode, rpt, vol, pan, pitch, speed, cutoff, choke) to type a
value, and click a column title to sort. Drag a row by its **⠿** into a VCO slot (dragging anywhere else selects
rows) or onto another row to move it there (while the grid isn't sorted), and **1 2 3** put the sound into that VCO
of the patch or take it out, as on the cards. **WAVE** draws each sound's waveform, with a playhead while it plays.
In the patches' grid a row click (or ▷) loads the patch, **☰** shows it in the rack, and **VCOS** draws its three
slots' waves. In both, **≈** orders the list by likeness to that row and **SIM** shows how alike each row is (to it,
or to a description; see [Semantic search](#semantic-search)): the grid then sorts by #, the order of likeness. Behind the rows the grid paints the selected sound's waveform, large and faint, and while anything
plays, the master's spectrum and scope (in the AU / VST3, whose engine plays outside the page, a glow that follows
the level). Playing rows light up; the grid follows the current theme.

### Themes

Click the **SSB** logo for the theme picker: 68 themes in five groups, each tile with its swatches. Hover a tile to
preview it on the whole board, click to keep it; ◀ ▶ at the top step through them in order, and **SCANLINES** there
turns the CRT lines on or off (off to begin with).
- **ERAS** — Noir '49, Diner '55, Surf '62, Psych '67, Avocado '72, Funk '74, LED Calc '76, Disco '77, Punk '77,
  Roots '78, Cassette '79, Laserium '83, Console '85, Outrun '86, Mall '87, Metal '88, Boombox '88, 8-Bit '89,
  Rave '92, Grunge '93, Vapor '95
- **GAMES** — Invaders '78, Vector '79, Pac-Maze '80, Arcade '81, Plumber '85, Legend '86, Pocket '89, Hedgehog '91,
  Fighter '91, 16-Bit '91, Hellfire '93, Island '93, Red Visor '95
- **COMPUTERS** — Woodgrain '77, Phosphor '78, CGA '81, Breadbin '82, Rubber Keys '82, Platinum '84, Workbench '85,
  Commander '86, Desktop '95, Bondi '98
- **MOVIES** — Galaxy '77, Nostromo '79, Replicant '82, Grid '82, Norad '83, Slimer '84, Cyborg '84, Flux '85,
  Neo-Tokyo '88, Afterlife '88, Dino Park '93, Code '99
- **TV** — Test Card '75, VJ '81, Knight '82, The Van '83, Vice '84, LCARS '87, Headroom '87, Bayside '89, Peaks '90,
  Splat '91, Gotham '92, Unexplained '93

### MPE

Turn on **MPE** (header PATCH group, or the matrix modal) for MPE controllers. Channel 1 is the master channel: its
bend, pressure, mod wheel and CC74 apply to every voice. Notes on channels 2–16 each get their own pitch bend,
pressure (→ AFTERTOUCH in the matrix) and CC74 (→ TIMBRE), including values sent just before the note starts. MPE is
always polyphonic.

- **Surfaces**: each patch says what an MPE controller's surfaces do to it — **STRIKE** (how hard a key is hit),
  **PRESS** (pressure into it while held) and **SLIDE** (moving up and down it, CC74) — on its VCOs, as routes of their
  own: the rack's **MPE** chip (or the matrix modal's MPE tab) shows and edits them. They act only while MPE is on;
  off, the patch plays as it always did. Every built-in patch comes voiced for MPE (PRESS and SLIDE always, STRIKE where
  it adds something): **PRESS is WT BLEND** on every VCO that plays its wavetable, so leaning into a key fades its
  wave into the next (all the way at full pressure; VCOs played as grains keep a press of their own). The AI patch
  maker binds them on what it makes. Sideways (GLIDE) bends each note's pitch;
  LIFT (release velocity) isn't used.
- **On / off and bend range** belong to the controller, not the patch: changing patches keeps them, and a plugin
  instance saves them with the session. With MPE on, the button halves and a dropdown beside it sets the per-note bend
  range to match your controller (±1 … ±96 semitones, default ±48, MPE's own default). A device that sends its range
  (RPN 0 on a member channel) sets it.
- **Zones**: one lower zone of 15 member channels until a device's MPE Configuration Message (RPN 6) says otherwise;
  an upper zone (channel 16 the master, 1–15 the notes) works too.
- **Release**: a note keeps following its channel while it rings out, until a new note takes the channel; then it
  keeps the bend it had (not the reset the controller sends just before the new note).
- **In a DAW**: the AU / VST3 tells the host it takes MPE, so hosts that ask (Live, Logic) send a controller's
  per-note channels instead of merging them onto one.

### Undo / presets

**⌘Z / ⇧⌘Z** (or the header buttons) undo pad and sound-shaping edits; a knob drag is one step, and deleted pads
come back. **PRESETS** in a pad's panel save its settings to a library shared by all pads (skipping name, tag,
clip, root and MIDI note); COPY / PASTE moves settings between pads directly. Presets are saved with the board and
included in exports.

### Header

OUTPUT + vertical VU · VIEW (RACK, PATCHES, SAMPLES toggles) · PATCH (◀ selected ▶, new, PLAY, POLY/MONO, HLD,
MPE, octave; the patch's name widens into the room the folded groups leave) · TEMPO · MIDI · global CHORUS /
DELAY / REVERB · BOARD (undo, redo, and **+**: add files or a folder, browse waves or the library, restore built-ins,
export / import the board). TEMPO · MIDI and the effects fold sideways (◀); they start folded. The rest always show.
Wraps into rows on narrow windows. **GLIDE** and the global modulation **MATRIX** sit in the rack's patch row, left of
its MPE chip.

**🎹** in the rack's patch row (right of VOYAGE) puts an **on-screen keyboard** across the bottom, for playing with no
keyboard at hand: a short strip of 32, 37, 49, 61, 76 or 88 keys (its size chip), − / + for its octave, a fixed
**VEL**ocity, and three strips: **PB** (pitch bend, springs back), **MOD** (CC1) and **EXP** (expression, CC11: the level
of everything playing). It plays the selected patch whether PLAY is on or not, in the app, the plugin and a browser
tab. Every finger, pen or the mouse is its own note, so chords work on a touch screen or a tablet. On a held key the
mouse wheel is aftertouch (a pen's pressure is too). With **MPE** on (its chip, or the header's) every note gets its own
channel and dragging around the key plays it: sideways bends it, a semitone per key; up and down is its timbre (CC74).
With MPE off, dragging slides from key to key. VOYAGE stays above it.

**+ → EXPORT…** lists every patch and sound in one grid (TYPE, NAME, TAG, what each is MADE OF): tick what goes into
the .zip (click a row; ⇧-click a run; filter by PATCHES / SOUNDS / MY SAMPLES or by text; ALL / NONE act on what's
shown), or take EVERYTHING. A ticked patch brings the sounds its VCOs use, and every sample they need travels with them
(from the board's store, the plugin's sample cache, or the decoded audio); if one can't be found the dialog names it
rather than leaving it out. AKWF wavetables and generators travel by name. **IMPORT BOARD…** reads the .zip back.

- **Select a patch** by clicking its card in the patches, or with ◀ ▶ in the header.
- **PLAY** turns MIDI and the computer keyboard into a piano for the selected patch (C4 = original pitch).
  Computer keys: `Z` row = C3 octave, `Q` row = C4 octave, `-` / `=` = octave down/up.
- **MONO** + **GLIDE** = legato portamento; **POLY** = each note its own voice (glide slides from the last note).

See [PLAN.md](PLAN.md) for the design and audio graph.

## License

[MIT](LICENSE). The desktop app and plugins are built with [JUCE](https://juce.com), which has its own license
terms for distributed binaries. The AKWF waveforms in `public/akwf` are Kristoffer Ekstrand's, dedicated to the public
domain under [CC0 1.0](public/akwf/LICENSE.md).
