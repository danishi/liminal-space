import backrooms from './backrooms.js';
import poolrooms from './poolrooms.js';
import pastel from './pastel.js';
import school from './school.js';
import station from './station.js';
import shrine from './shrine.js';
import hotel from './hotel.js';

// Levels are picked at random; each has a `tint` used for the light behind
// doors that lead to it.
export const STAGES = [backrooms, poolrooms, pastel, school, station, shrine, hotel];
