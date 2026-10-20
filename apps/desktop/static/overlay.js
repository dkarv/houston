// Draws Houston's pointer (overlay mode) and a ripple wherever Houston clicks.
const pointer = document.getElementById('pointer');
const at = (element, { x, y }) => {
  element.style.left = `${x * window.innerWidth}px`;
  element.style.top = `${y * window.innerHeight}px`;
};

window.houstonOverlay.onPointer((move) => {
  pointer.style.display = 'block';
  at(pointer, move);
});

window.houstonOverlay.onClick((click) => {
  const ripple = document.createElement('div');
  ripple.className = 'ripple';
  at(ripple, click);
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 1000);
});
