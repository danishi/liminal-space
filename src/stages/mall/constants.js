// Dimensions, zones, names and the PA script shared by the mall modules.

export const PI = Math.PI;
export const CS = 2.5;
export const W = 56;
export const HH = 34;
export const UP = 3.2; // upper concourse floor
export const ATRIUM = 7.8; // atrium ceiling
export const SHOP_H = 3.4; // shop ceiling above its floor
export const PIT = -0.9; // fountain court floor
export const FOOD = -0.6; // food court seating
export const DOCK = -1.2; // loading dock
export const Z = { PUB: 0, SHOP: 1, SERV: 2, REST: 3, OFFICE: 4 };
export const ESC = [13, 37, 45]; // escalator pairs (first column)
export const MALL = 'Willow Creek Galleria';

export const WATCHER_LOOK = { body: 0x1a1816, coat: true };

// PA announcements, cycling
export const PA = [
  'Attention shoppers: the mall will close in five minutes. The mall has been closing in five minutes since 1996.',
  'Will the owner of a white sedan, licence plate YOU, please return to your body.',
  'Lost child at the information desk. The child says they are 41.',
  'Today only: everything must go. Including you.',
  'Reminder: the escalators are not broken. They are stairs now. Thank you for your patience.',
  'Mall walkers, you are on lap nine thousand. Please remember to hydrate.',
  'The fountain is not accepting wishes at this time.',
  'Will the person in aisle… there are no aisles. Never mind.',
];
export const PA_DEEP = [
  'Security to the mannequins. Security to the mannequins. …Security?',
  'Please do not look behind you. Thank you for shopping at Willow Creek.',
  'The food court is now serving. Nothing. The food court is now serving nothing.',
];
