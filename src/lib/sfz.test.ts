import { describe, expect, it } from 'vitest'
import { normalisePath, parseSfz, sfzNote } from './sfz'
import { sniffSampleRate } from './sampleRate'

describe('sfzNote', () => {
  it('reads numbers and note names (c4 = 60)', () => {
    expect(sfzNote('60', 0)).toBe(60)
    expect(sfzNote('c4', 0)).toBe(60)
    expect(sfzNote('C#4', 0)).toBe(61)
    expect(sfzNote('db4', 0)).toBe(61)
    expect(sfzNote('a-1', 0)).toBe(9)
    expect(sfzNote(undefined, 42)).toBe(42)
    expect(sfzNote('bogus', 7)).toBe(7)
  })
})

describe('parseSfz', () => {
  it('inherits global → group → region and applies default_path', () => {
    const { regions: r } = parseSfz(`
      // a comment
      <control> default_path=samples\\piano\\
      <global> ampeg_release=0.5 volume=-3
      <group> lovel=1 hivel=64
      <region> sample=C4 soft.wav key=60
      <region> sample=D4.wav lokey=61 hikey=63 pitch_keycenter=62 volume=0
      <group> lovel=65 hivel=127 /* block
      comment */
      <region> sample=../loud/C4.flac key=c4
    `)
    expect(r).toHaveLength(3)
    expect(r[0].sample).toBe('samples/piano/C4 soft.wav')
    expect(r[0].opcodes).toMatchObject({ key: '60', lovel: '1', hivel: '64', ampeg_release: '0.5', volume: '-3' })
    expect(r[1].opcodes.volume).toBe('0')
    expect(r[2].sample).toBe('samples/loud/C4.flac')
    expect(r[2].opcodes.hivel).toBe('127')
  })

  it('shares #defines across #includes', () => {
    const files: Record<string, string> = {
      'defs.txt': '#define $EXT flac',
      'regions.txt': '<region> sample=a.$EXT key=60',
    }
    const { regions: r } = parseSfz('#include "defs.txt"\n#include "regions.txt"', (p) => files[p] ?? null)
    expect(r[0].sample).toBe('a.flac')
  })

  it('expands #define and #include', () => {
    const { regions: r } = parseSfz(`#define $KEY 64\n#include "inc.sfz"\n<region> sample=a.wav key=$KEY`, (p) =>
      p === 'inc.sfz' ? '<group> volume=-6' : null,
    )
    expect(r[0].opcodes).toMatchObject({ key: '64', volume: '-6' })
  })

  it('handles #define / #include mid-line, redefined per region (BengtNilsson.HeadroomPiano shape)', () => {
    const files: Record<string, string> = {
      'Data/close.txt': '#define $MIC CLOSE',
      'Data/group.txt': '<group>\nlovel=1\nhivel=59\n#define $VEL LEVEL1\n#include "Data/region.txt"\n',
      'Data/region.txt': [
        'group_label=$VEL',
        '<region> #define $KEY 21 lokey=21 hikey=22 #include "Data/sample.txt"',
        '<region> #define $KEY 90 lokey=89 hikey=91 #include "Data/sample.txt" ampeg_release_oncc$DAMPER=10',
      ].join('\n'),
      'Data/sample.txt': 'sample=HEADROOM PIANO $VEL $MIC $KEY.$EXT\npitch_keycenter=$KEY\nregion_label=$KEY',
    }
    const main = [
      '#define $DAMPER 67',
      '#define $VELTRACK 73',
      '#define $EXT flac',
      '<control>\ndefault_path=Samples/\nset_hdcc$VELTRACK=1',
      '<global> amp_veltrack_oncc$VELTRACK=100',
      '<master>\ngroup=1\n#include "Data/close.txt"\n#include "Data/group.txt"',
      '<curve>\ncurve_index=7\nv000=1',
    ].join('\n')
    const { regions: r, control } = parseSfz(main, (p) => files[p] ?? null)
    expect(r).toHaveLength(2)
    expect(r[0].sample).toBe('Samples/HEADROOM PIANO LEVEL1 CLOSE 21.flac')
    expect(r[0].opcodes).toMatchObject({ lokey: '21', hikey: '22', pitch_keycenter: '21', lovel: '1', amp_veltrack_oncc73: '100' })
    expect(r[1].sample).toBe('Samples/HEADROOM PIANO LEVEL1 CLOSE 90.flac')
    expect(r[1].opcodes.ampeg_release_oncc67).toBe('10')
    expect(control.set_hdcc73).toBe('1')
  })

  it('applies note_offset / octave_offset, keeps generators and control opcodes', () => {
    const { regions: r, control } = parseSfz(`<control> octave_offset=1 set_cc1=64\n<region> sample=a.wav key=48\n<region> sample=*Sine key=60`)
    expect(r).toHaveLength(2)
    expect(r[0].opcodes.key).toBe('60')
    expect(r[1].sample).toBe('*sine')
    expect(control.set_cc1).toBe('64')
  })

  it('normalises paths', () => {
    expect(normalisePath('a\\b\\..\\c/./d.wav')).toBe('a/c/d.wav')
  })
})

describe('sniffSampleRate', () => {
  it('reads WAV and FLAC headers', () => {
    const wav = new ArrayBuffer(44)
    const d = new DataView(wav)
    const w = (o: number, s: string) => [...s].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)))
    w(0, 'RIFF')
    w(8, 'WAVE')
    w(12, 'fmt ')
    d.setUint32(16, 16, true)
    d.setUint32(24, 48000, true)
    expect(sniffSampleRate(wav)).toBe(48000)

    const flac = new ArrayBuffer(42)
    const f = new DataView(flac)
    ;[...'fLaC'].forEach((c, i) => f.setUint8(i, c.charCodeAt(0)))
    // 44100 = 0x0AC44 → 20 bits across bytes 18..20
    f.setUint8(18, 0x0a)
    f.setUint8(19, 0xc4)
    f.setUint8(20, 0x40)
    expect(sniffSampleRate(flac)).toBe(44100)
    expect(sniffSampleRate(new ArrayBuffer(4))).toBeNull()
  })
})

import { filterPlayable, nearestZone, pickZones, regionToZone, zoneSemis } from './zones'

describe('zones', () => {
  const z = (o: Record<string, string>) => regionToZone(o, 'a', 44100)!
  it('converts opcodes (samples → seconds, dB, loops, env)', () => {
    const zone = z({ key: 'c4', offset: '44100', loop_start: '4410', loop_end: '88200', amplitude: '50', ampeg_release: '0.7', ampeg_sustain: '50' })
    expect(zone).toMatchObject({ lokey: 60, hikey: 60, keycenter: 60, offset: 1, loopStart: 0.1, loopEnd: 2, loopMode: 'loop_continuous' })
    expect(zone.volume).toBeCloseTo(-6.02, 1)
    expect(zone.env).toEqual({ r: 0.7, s: 0.5 })
    expect(z({ lokey: '48', hikey: '59', pitch_keycenter: '55' })).toMatchObject({ lokey: 48, hikey: 59, keycenter: 55, loopMode: 'no_loop' })
    expect(regionToZone({ end: '-1' }, 'a', 44100)).toBeNull()
  })
  it('picks by key, velocity, round robin and random', () => {
    const zones = [
      z({ lokey: '0', hikey: '63', hivel: '64' }),
      z({ lokey: '0', hikey: '63', lovel: '65' }),
      z({ lokey: '64', hikey: '127', seq_length: '2', seq_position: '1' }),
      z({ lokey: '64', hikey: '127', seq_length: '2', seq_position: '2' }),
    ]
    expect(pickZones(zones, 60, 30, 0)).toEqual([zones[0]])
    expect(pickZones(zones, 60, 100, 0)).toEqual([zones[1]])
    expect(pickZones(zones, 70, 100, 0)).toEqual([zones[2]])
    expect(pickZones(zones, 70, 100, 1)).toEqual([zones[3]])
    const r = [z({ key: '60', lorand: '0', hirand: '0.5' }), z({ key: '60', lorand: '0.5', hirand: '1' })]
    expect(pickZones(r, 60, 100, 0, 0.7)).toEqual([r[1]])
  })
  it('computes pitch shift and nearest zone', () => {
    const zone = z({ lokey: '60', hikey: '72', pitch_keycenter: '60', transpose: '12', tune: '50' })
    expect(zoneSemis(zone, 62)).toBe(14.5)
    const zones = [z({ lokey: '0', hikey: '40' }), z({ lokey: '50', hikey: '70' })]
    expect(nearestZone(zones, 46)?.lokey).toBe(50)
  })
  it('keeps attack regions of the default keyswitch', () => {
    const out = filterPlayable([
      { sample: 'a', sw_last: 'c1', sw_default: 'c1' },
      { sample: 'b', sw_last: 'd1' },
      { sample: 'c', trigger: 'release' },
      { sample: 'e', trigger: 'legato' },
      { sample: 'd' },
    ])
    expect(out.map((o) => o.sample)).toEqual(['a', 'c', 'd'])
  })
})

describe('SFZ release triggers, CC, filters, LFOs', () => {
  const z = (o: Record<string, string>) => regionToZone(o, 'a', 44100)!
  it('picks release regions only on note-off, and gates by CC range', () => {
    const zones = [z({ key: '60' }), z({ key: '60', trigger: 'release', rt_decay: '6' }), z({ key: '60', locc64: '64', hicc64: '127' })]
    expect(zones[1]).toMatchObject({ trigger: 'release', rtDecay: 6 })
    expect(pickZones(zones, 60, 100, 0)).toEqual([zones[0]])
    expect(pickZones(zones, 60, 100, 0, 0.5, { trigger: 'release' })).toEqual([zones[1]])
    const cc = new Float32Array(128)
    cc[64] = 1
    expect(pickZones(zones, 60, 100, 0, 0.5, { cc })).toEqual([zones[0], zones[2]])
  })
  it('reads CC mods, filter + filter EG, v1 and v2 LFOs', () => {
    const zone = z({
      key: '60',
      volume_oncc7: '-12',
      cutoff_cc74: '2400',
      fil_type: 'hpf_2p',
      cutoff: '500',
      resonance: '6',
      fil_keytrack: '100',
      fileg_depth: '1200',
      fileg_attack: '0.1',
      pitchlfo_freq: '5',
      pitchlfo_depth: '20',
      lfo1_freq: '2',
      lfo1_wave: '7',
      lfo1_cutoff: '600',
    })
    expect(zone.ccMods).toEqual([
      { target: 'volume', cc: 7, amount: -12 },
      { target: 'cutoff', cc: 74, amount: 2400 },
    ])
    expect(zone.filter).toMatchObject({ type: 'highpass', cutoff: 500, resonance: 6, keytrack: 100 })
    expect(zone.filter?.env).toMatchObject({ a: 0.1, depth: 1200, s: 1 })
    expect(zone.lfos).toEqual([
      { target: 'pitch', depth: 20, freq: 5, delay: 0, wave: 'sine' },
      { target: 'cutoff', depth: 600, freq: 2, delay: 0, wave: 'sawtooth', invert: true },
    ])
  })
})

import { cycleSample, synthWave } from '../audio/synthWaves'
describe('generators', () => {
  it('maps names and builds band-limited cycles', () => {
    expect(synthWave('*tri')).toBe('triangle')
    expect(synthWave('*saw')).toBe('saw')
    expect(synthWave('*bogus')).toBeNull()
    expect(cycleSample('sine', 0.25)).toBeCloseTo(1)
    expect(cycleSample('square', 0.25)).toBeCloseTo(1, 1)
    expect(cycleSample('triangle', 0.25)).toBeCloseTo(1, 1)
  })
})

describe('normalisePath', () => {
  it('folds dir/.. but keeps leading .. (samples above the .sfz)', () => {
    expect(normalisePath('Programs/../Samples/a.wav')).toBe('Samples/a.wav')
    expect(normalisePath('..\\Samples\\a.wav')).toBe('../Samples/a.wav')
    expect(normalisePath('./x/../../y.wav')).toBe('../y.wav')
  })
})

import { encodeWav, planarFromBase64 } from './wav'

describe('wav', () => {
  it('writes a float32 WAV and reads planar base64 back', async () => {
    const l = new Float32Array([0, 0.5, -0.5, 1])
    const r = new Float32Array([1, -1, 0.25, 0])
    const wav = new Uint8Array(await encodeWav([l, r], 48000).arrayBuffer())
    const v = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(v.getUint16(20, true)).toBe(3)
    expect(v.getUint32(24, true)).toBe(48000)
    expect(v.getFloat32(44 + 4, true)).toBe(1) // frame 0, right
    const planar = new Uint8Array(new Float32Array([...l, ...r]).buffer)
    const b64 = btoa(String.fromCharCode(...planar))
    const [a, b] = planarFromBase64(b64, 2)
    expect([...a]).toEqual([...l])
    expect([...b]).toEqual([...r])
  })
})
