/* DraftCoach Installer — Logic + IPC */

var currentPage = 0;
var pageIds = ['page-welcome', 'page-directory', 'page-installing', 'page-finish'];

// ── IPC — renamed to avoid collision with wry's window.ipc ──────
function sendToRust(cmd, data) {
  try {
    var payload = JSON.stringify({ cmd: cmd, data: data || {} });
    if (window.ipc && window.ipc.postMessage) {
      window.ipc.postMessage(payload);
    }
  } catch(e) { console.error('IPC error:', e); }
}

// Called from Rust via evaluate_script
function onMessage(msg) {
  var m = typeof msg === 'string' ? JSON.parse(msg) : msg;
  switch (m.event) {
    case 'set_dir':
      document.getElementById('dir-input').value = m.data.path;
      break;
    case 'progress':
      updateProgress(m.data.percent, m.data.status);
      break;
    case 'install_complete':
      clearInterval(fakeInterval);
      goToPage(3);
      break;
    case 'install_error':
      clearInterval(fakeInterval);
      document.getElementById('install-status').textContent = 'Error: ' + (m.data.message || 'Failed');
      document.getElementById('install-status').style.color = '#E84057';
      break;
  }
}

// ── Page Navigation ─────────────────────────────────────────────
function goToPage(idx) {
  if (idx < 0 || idx >= pageIds.length) return;
  var prev = currentPage;
  currentPage = idx;
  pageIds.forEach(function(id, i) {
    var el = document.getElementById(id);
    el.classList.remove('active', 'exit');
    if (i === idx) el.classList.add('active');
    else if (i === prev) el.classList.add('exit');
  });
  document.querySelectorAll('.step').forEach(function(s, i) {
    s.classList.remove('active', 'done');
    if (i === idx) s.classList.add('active');
    else if (i < idx) s.classList.add('done');
  });
  document.querySelectorAll('.step-line').forEach(function(l, i) {
    if (i < idx) l.classList.add('done');
    else l.classList.remove('done');
  });
}

function nextPage() { goToPage(currentPage + 1); }
function prevPage() { goToPage(currentPage - 1); }

function startInstall() {
  var dir = document.getElementById('dir-input').value;
  goToPage(2);
  sendToRust('install', { path: dir });
  simulateProgress();
}

// ── Progress ────────────────────────────────────────────────────
var fakeProgress = 0;
var fakeInterval = null;

function simulateProgress() {
  fakeProgress = 0;
  fakeInterval = setInterval(function() {
    if (fakeProgress < 85) {
      fakeProgress += Math.random() * 2.5 + 0.3;
      fakeProgress = Math.min(fakeProgress, 85);
      updateProgress(fakeProgress, getStatus(fakeProgress));
    }
  }, 250);
}

function getStatus(p) {
  if (p < 10) return 'Preparing files...';
  if (p < 30) return 'Extracting application...';
  if (p < 50) return 'Installing components...';
  if (p < 70) return 'Configuring system...';
  if (p < 85) return 'Registering application...';
  return 'Finalizing...';
}

function updateProgress(pct, status) {
  var bar = document.getElementById('progress-bar');
  var txt = document.getElementById('progress-pct');
  var st = document.getElementById('install-status');
  var r = Math.round(pct);
  bar.style.width = r + '%';
  txt.textContent = r + '%';
  if (status) st.textContent = status;
  if (r >= 100) {
    clearInterval(fakeInterval);
    txt.textContent = '100%';
    st.textContent = 'Installation complete!';
    st.style.color = '#C89B3C';
    setTimeout(function(){ goToPage(3); }, 600);
  }
}

// ── Particles ───────────────────────────────────────────────────
function initParticles() {
  var c = document.getElementById('particles');
  if (!c) return;
  var ctx = c.getContext('2d');
  var ps = [];
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  window.addEventListener('resize', function(){ c.width=window.innerWidth; c.height=window.innerHeight; });
  for (var i = 0; i < 25; i++) {
    ps.push({ x:Math.random()*c.width, y:Math.random()*c.height,
              vx:(Math.random()-0.5)*0.25, vy:(Math.random()-0.5)*0.25,
              r:Math.random()*1.5+0.5, a:Math.random()*0.35+0.05 });
  }
  (function draw() {
    ctx.clearRect(0,0,c.width,c.height);
    ps.forEach(function(p){
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=c.width; if(p.x>c.width)p.x=0;
      if(p.y<0)p.y=c.height; if(p.y>c.height)p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.28);
      ctx.fillStyle='rgba(200,155,60,'+p.a+')'; ctx.fill();
    });
    requestAnimationFrame(draw);
  })();
}

// ── Init ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Block right-click context menu
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  // Block browser shortcuts (Ctrl+R, Ctrl+P, Ctrl+S, F5, etc)
  document.addEventListener('keydown', function(e){
    if (e.key === 'F5' || (e.ctrlKey && ['r','p','s','u'].indexOf(e.key.toLowerCase()) !== -1)) {
      e.preventDefault();
    }
  });

  initParticles();
  sendToRust('get_default_dir');

  document.getElementById('btn-min').addEventListener('click', function(e){ e.stopPropagation(); sendToRust('minimize'); });
  document.getElementById('btn-close').addEventListener('click', function(e){
    e.stopPropagation();
    // On finish page, just close. Otherwise show confirmation.
    if (currentPage === 3) { sendToRust('cancel'); }
    else { document.getElementById('exit-modal').classList.add('visible'); }
  });
  document.getElementById('btn-install-now').addEventListener('click', function(e){ e.stopPropagation(); nextPage(); });
  document.getElementById('btn-browse').addEventListener('click', function(e){ e.stopPropagation(); sendToRust('browse'); });
  document.getElementById('btn-back-dir').addEventListener('click', function(e){ e.stopPropagation(); prevPage(); });
  document.getElementById('btn-start-install').addEventListener('click', function(e){ e.stopPropagation(); startInstall(); });
  document.getElementById('btn-launch').addEventListener('click', function(e){ e.stopPropagation(); sendToRust('launch'); });

  // Exit confirmation modal
  document.getElementById('btn-exit-no').addEventListener('click', function(e){
    e.stopPropagation();
    document.getElementById('exit-modal').classList.remove('visible');
  });
  document.getElementById('btn-exit-yes').addEventListener('click', function(e){
    e.stopPropagation();
    sendToRust('cancel');
  });
});
