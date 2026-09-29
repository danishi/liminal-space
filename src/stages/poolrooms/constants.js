// Measurements shared by the Poolrooms' build phases (metres)
export const H = 4.2; // room ceiling
export const LINTEL = 2.9;
// floor of a room's basin, below its deck: kept clearly within a stride (0.55 m).
// At exactly -0.55 the float32 heights made the step a hair too tall, so every
// basin was sealed off as unreachable and walled in, ducks and all.
export const POOL = -0.5;
export const WATER_Y = -0.12; // water surface, below the deck
export const HALL_H = 9; // the natatorium's roof
