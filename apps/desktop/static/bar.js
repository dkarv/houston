const params = new URLSearchParams(location.search);
document.getElementById('text').textContent = params.get('text');
const stop = document.getElementById('stop');
stop.textContent = params.get('stop');
stop.addEventListener('click', () => window.houstonOverlay.stop());
