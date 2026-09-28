// Dimensions and the plan of the car park, in grid cells.

export const CS = 2.5; // one bay wide
export const H = 2.75; // slab to slab
export const P6 = 0;
export const P7 = -3;
export const W = 48;
export const HH = 35;
export const PI = Math.PI;

// bay rows: two cells deep; `lane` is the side the lane is on (+1: larger j)
export const BAY_ROWS = [
  { j: 1, lane: 1, zone: 0 },
  { j: 5, lane: -1, zone: 1 },
  { j: 7, lane: 1, zone: 2 },
  { j: 11, lane: -1, zone: 3 },
  { j: 13, lane: 1, zone: 4 },
  { j: 26, lane: -1, zone: 5 },
  { j: 28, lane: 1, zone: 6 },
  { j: 32, lane: -1, zone: 7 },
];
export const LANES = [3, 9, 15, 24, 30]; // first row of each two-row driving lane
export const CROSS = [1, 21, 41]; // first column of each two-column cross lane
export const SEGS = [3, 23]; // first column of each run of 18 bays
export const ZONES = 'ABCDEFGH';
export const ZONE_COLORS = ['#c8322a', '#2a5cb0', '#2f8a4a', '#d9a51c', '#7a3d9a', '#d8641c', '#1f8c8c', '#c04a7a'];
