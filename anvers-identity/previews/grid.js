'use strict';

// Twenty-four seeds. Shape and colour are pinned so that the grid shows each
// of the nine pairs at least twice; pinning leaves each seed's distortion as
// the seed draws it.
document.addEventListener('DOMContentLoaded', () => {
  const A = window.AnversIdentity;
  const grid = document.getElementById('grid');
  for (let i = 1; i <= 24; i++) {
    const seed = `anvers-${String(i).padStart(2, '0')}`;
    const shape = A.shapes[(i - 1) % 3];
    const colour = A.colours[Math.floor((i - 1) / 3) % 3];
    const item = document.createElement('li');
    const cell = document.createElement('div');
    cell.className = 'cell';
    const holder = document.createElement('span');
    cell.appendChild(holder);
    const mark = A.render(holder, {seed, shape, colour, label: `Anvers mark, seed ${seed}`});
    const caption = document.createElement('span');
    caption.className = 'caption';
    caption.textContent = `${seed} · ${mark.shape} · ${mark.colour}`;
    item.append(cell, caption);
    grid.appendChild(item);
  }
}, {once: true});
