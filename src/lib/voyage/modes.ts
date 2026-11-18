/** The rack's PLAY view, two ways (board.master.playMode, chosen in VCO 1's PERFORM settings). */
export type PlayMode = 'pads' | 'voyage'
export const PLAY_MODES: { id: PlayMode; label: string; title: string }[] = [
  { id: 'pads', label: 'PADS', title: 'The XY pads, a column for each VCO' },
  { id: 'voyage', label: 'VOYAGE', title: 'Full screen: the three VCOs\' pads are the parts of a ship on a voyage through a field of sounds' },
]
