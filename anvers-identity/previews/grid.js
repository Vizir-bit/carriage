'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('grid');
  for (let i = 1; i <= 24; i++) {
    const seed = `anvers-${String(i).padStart(2, '0')}`;
    const item = document.createElement('li');
    const cell = document.createElement('div');
    cell.className = 'cell';
    const holder = document.createElement('span');
    cell.appendChild(holder);
    const mark = window.AnversIdentity.render(holder, {seed, label: `Anvers mark, seed ${seed}`});
    const caption = document.createElement('span');
    caption.className = 'caption';
    caption.textContent = `${seed} · ${mark.shape} · ${mark.colour}`;
    item.append(cell, caption);
    grid.appendChild(item);
  }
}, {once: true});
