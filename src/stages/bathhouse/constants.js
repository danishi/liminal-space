// Layout of the bathhouse level: module sizes, floor heights and zones.

export const PI = Math.PI;
export const Y_WOOD_ = 0.3; // raised wooden floor of the changing rooms
export const MW = 17; // module (one bathhouse) width in cells, walls included
export const MD = 27; // module depth
export const NX = 3; // bathhouses per row
export const GAP = 3; // outdoor passage between bathhouses
export const TOP = 10; // roof-terrace rows above the first row
export const ALLEY = 5;
export const W = NX * MW + (NX - 1) * GAP;
export const ROW_A = TOP;
export const ALLEY0 = ROW_A + MD;
export const ROW_B = ALLEY0 + ALLEY;
export const H = ROW_B + MD;

export const BANDAI_PH = 0.5; // the bandai platform
export const BANDAI_CH = 0.62; // its counter boards
export const BANDAI_TOP = Y_WOOD_ + BANDAI_PH + BANDAI_CH + 0.05;
export const BAND = 0.8; // top of the blue tile band in the bath hall
export const Y_GENKAN = 0;
export const Y_WOOD = Y_WOOD_;
export const Y_BATH = 0;
export const Y_RIM = 0.45; // bath rim you step over
export const Y_BENCH = 0.18; // the sitting step inside the bath
export const Y_DEEP = -0.12;
export const Y_SURF = 0.37;
export const Y_ALLEY = -0.12;
export const Y_TERR = 2.6; // roof terrace
export const TERR_POOL = -0.5; // open-air bath floor, relative to the terrace
export const BATH_CEIL = 5.2;
export const BATH_CEIL_HI = 6.4; // raised roof over the middle of the bath hall (steam vents)

export const Z_GENKAN = 1;
export const Z_DRESS = 2;
export const Z_BATH = 3;
export const Z_GAP = 4;
export const Z_ALLEY = 5;
export const Z_TERR = 6;
export const outdoor = (z) => z >= Z_GAP;

export const NAMES = ['富士の湯', '富士の湯', '富士の湯', '冨士の湯', '富土の湯', '士富の湯', '湯の士富'];
