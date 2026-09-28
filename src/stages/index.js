// Every level, in the order the game numbers them. Only this table is in the
// main bundle: a level's code is fetched the first time it is needed (see
// loadStage) and merged into its entry. Levels are picked at random; `tint`
// colours the light behind doors that lead to one.
export const STAGES = [
  { id: 'backrooms', code: 'LEVEL 0', name: 'The Backrooms', sub: 'Endless yellow rooms', tint: 0xfff0b0, load: () => import('./backrooms.js') },
  { id: 'poolrooms', code: 'LEVEL 37', name: 'The Poolrooms', sub: 'Tiles, water, echoes', tint: 0xd8fbff, load: () => import('./poolrooms.js') },
  { id: 'pastel', code: 'LEVEL 3.14', name: 'Pastel Dreamscape', sub: 'Cotton-candy sky', tint: 0xffd6ee, load: () => import('./pastel.js') },
  { id: 'school', code: 'LEVEL 188', name: 'After-School Hallways', sub: '黄昏の校舎 · A school in Japan at dusk', tint: 0xffc890, load: () => import('./school.js') },
  { id: 'station', code: 'LEVEL 8', name: 'Last-Train Underpass', sub: '終電後の地下通路 · A station in Japan after the last train', tint: 0xe8fff0, load: () => import('./station.js') },
  { id: 'shrine', code: 'LEVEL 1000', name: 'Thousand Gates', sub: '千本鳥居 · A shrine path in Japan at night', tint: 0xff8a50, load: () => import('./shrine.js') },
  { id: 'hotel', code: 'LEVEL 11', name: 'The Night Hotel', sub: 'Red carpet, no guests', tint: 0xffc080, load: () => import('./hotel.js') },
  { id: 'mall', code: 'LEVEL 94', name: 'The Dead Mall', sub: 'Muzak for no one', tint: 0xffe6c8, load: () => import('./mall/index.js') },
  { id: 'garage', code: 'LEVEL 6', name: 'Parking Level P6', sub: 'P6 of P∞', tint: 0xffb060, load: () => import('./garage/index.js') },
  { id: 'bathhouse', code: 'LEVEL 26', name: 'Midnight Bathhouse', sub: '深夜の銭湯 · Open late. Very late.', tint: 0x9ad8ff, load: () => import('./bathhouse/index.js') },
];

/** Loads a level's definition (assets, build, makeDoor, bleed…) into its STAGES entry, once. */
export async function loadStage(index) {
  const stage = STAGES[index];
  if (!stage.build) Object.assign(stage, (await stage.load()).default);
  return stage;
}
