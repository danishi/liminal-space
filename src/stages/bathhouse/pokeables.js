/** What tapping a bucket, the milk fridge, a massage chair or a scale does. */
export function pokeables(world, lvl) {
  const { poke, buckets, fridges, massageChairs, scales } = lvl;

  // ---- pokeables: buckets, milk, the massage chairs and scales
  for (const b of buckets) {
    b.prompt = 'Tap the bucket';
    b.range = 1.9;
    b.use = (game) => {
      b.hop = 1;
      game.audio.bucket(null);
    };
    poke.add(b);
  }
  const milkLines = [
    ['(You take a coffee milk. It is ice cold.)', '(The cap says: BEST BEFORE 昭和64年. That year only lasted a week.)'],
    ['(A fruit milk. You drink it in one go, hand on your hip, the proper way.)'],
    ['(Plain milk. It tastes like being eight years old in 1984.)'],
    ['(The fridge is full again. It is always full again.)'],
  ];
  let milkN = 0;
  const chairLines = [
    ['(You drop a coin in. It kneads your back with the force of a small earthquake.)'],
    ['(It stops. It starts again. You didn’t put a coin in this time.)'],
    ['(The chair is warm, as if someone just got up.)'],
  ];
  let chairN = 0;
  const scaleLines = [
    ['(The needle swings round, keeps going, and comes back to zero.)', '(You weigh nothing here.)'],
    ['(It reads 0 kg. It also read 0 kg for the man before you. There was no man before you.)'],
  ];
  let scaleN = 0;
  for (const f of fridges) f.use = (game) => game.openDialog('the milk fridge', milkLines[milkN++ % milkLines.length], 1);
  for (const ch of massageChairs) {
    ch.use = (game) => {
      ch.shake = 3.5;
      game.openDialog('the massage chair', chairLines[chairN++ % chairLines.length], 0.7);
    };
  }
  for (const sc of scales) {
    sc.use = (game) => {
      sc.spin = 1;
      game.openDialog('the scale', scaleLines[scaleN++ % scaleLines.length], 1);
    };
  }
  world.add(poke);
}
