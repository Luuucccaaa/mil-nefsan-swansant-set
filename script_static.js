const { paragraphs, medias } = JSON.parse(document.getElementById('data').textContent);
const words = paragraphs.reduce((acc, p, i) => {
  acc.push(...p);
  if (i < paragraphs.length - 1) acc.push('¶');
  return acc;
}, []);

const stage       = document.getElementById('stage');
const textLayer   = document.getElementById('text-layer');
const mediaLayer  = document.getElementById('media-layer');
const progressBar = document.getElementById('progress-bar');

// ── Construit les spans de mots (tous visibles d'emblée) ─────────────
const wordEls = [];
words.forEach(w => {
  if (w === '¶') {
    const br = document.createElement('div');
    br.className = 'word para-break shown';
    textLayer.appendChild(br);
    wordEls.push(br);
    return;
  }

  if (w === '\n') {
    const br = document.createElement('div');
    br.className = 'word line-break shown';
    br.style.cssText = 'width:100%;height:0;font-size:inherit;line-height:0;margin-top:-0.08em;margin-bottom:-0.08em;padding:0;';
    textLayer.appendChild(br);
    wordEls.push(br);
    return;
  }

  // Supporte deux syntaxes pour les mots en contour :
  //   chaîne  : "__outline__mot"
  //   objet   : { "w": "mot", "style": "outline" }
  let text = w;
  let isOutline = false;
  if (typeof w === 'object' && w !== null) {
    text      = w.w;
    isOutline = w.style === 'outline';
  } else if (typeof w === 'string' && w.startsWith('__outline__')) {
    text      = w.slice(11);
    isOutline = true;
  }

  const span = document.createElement('span');
  span.className = 'word shown' + (isOutline ? ' outline' : '');
  span.textContent = text;
  textLayer.appendChild(span);
  wordEls.push(span);
});

// ── SVG pour les filets ───────────────────────────────────────────────
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9;overflow:visible;';
document.body.appendChild(svg);

// ── Mode édition : permet de déplacer/redimensionner TOUS les blocs ──
// même quand ils ne sont pas "actifs" (hors de leur fenêtre de scroll).
// Activation : touche "E", ou ajouter ?edit à l'URL.
let editMode = new URLSearchParams(window.location.search).has('edit');

function applyEditMode() {
  document.body.classList.toggle('edit-mode', editMode);
  medias.forEach(m => { if (m._el) m._el.classList.toggle('force-active', editMode); });

  // Si on active le mode édition pendant que l'écran d'intro est encore
  // affiché, #main-content est en display:none et tout reste à 0x0 px,
  // donc invisible/impossible à déplacer. On force son affichage.
  if (editMode) {
    const intro = document.getElementById('intro-screen');
    const main  = document.getElementById('main-content');
    if (intro) intro.style.display = 'none';
    if (main) { main.style.display = 'block'; main.style.opacity = '1'; }
  }
}

window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'e' && !e.target.closest('input, textarea')) {
    editMode = !editMode;
    applyEditMode();
    console.log(editMode
      ? '✏️ Mode édition activé : tous les blocs sont déplaçables/redimensionnables. Touche E pour quitter.'
      : '✏️ Mode édition désactivé.');
  }
});

// Affiche dans la console la position/taille à recopier dans le JSON
// (en % de la fenêtre, comme le format attendu par "pos"/"size").
function logPosition(el, idx, m) {
  const rect = el.getBoundingClientRect();
  const top  = (rect.top  / window.innerHeight * 100).toFixed(1) + '%';
  const left = (rect.left / window.innerWidth  * 100).toFixed(1) + '%';
  const size = (rect.width / window.innerWidth * 100).toFixed(1) + '%';
  console.log(
    `Média #${idx} (${m.type}) → à recopier dans le JSON :\n` +
    JSON.stringify({ pos: { top, left }, size }, null, 2)
  );
}

// ── Construit les overlays médias ─────────────────────────────────────
medias.forEach((m, idx) => {
  const div = document.createElement('div');
  div.className = 'media-overlay';
  Object.entries(m.pos).forEach(([k, v]) => div.style[k] = v);
  div.style.width = m.size || '35%';

  const inner = document.createElement('div');

  if (m.type === 'image') {
    const mediaWrap = document.createElement('div');
    mediaWrap.style.position = 'relative';
    const img = document.createElement('img');
    img.className = 'overlay-img'; img.alt = m.caption || '';
    img.onerror = () => { div.remove(); m._el = null; };
    img.src = m.src;
    mediaWrap.appendChild(img);
    inner.appendChild(mediaWrap);
    m._mediaWrap = mediaWrap;

  } else if (m.type === 'video') {
    const mediaWrap = document.createElement('div');
    mediaWrap.style.position = 'relative';
    const vid = document.createElement('video');
    vid.className = 'overlay-video';
    vid.loop = true; vid.muted = false; vid.playsInline = true;
    vid.onerror = () => { div.remove(); m._el = null; };
    vid.innerHTML = `<source src="${m.src}" type="video/mp4">`;
    mediaWrap.appendChild(vid);
    m._vid = vid;

    const playBtn = document.createElement('div');
    playBtn.className = 'vid-play-btn';
    playBtn.textContent = '▶';
    mediaWrap.appendChild(playBtn);
    playBtn.addEventListener('click', () => { vid.play().catch(() => {}); playBtn.style.display = 'none'; });
    vid.addEventListener('click', () => { if (!vid.paused) { vid.pause(); playBtn.style.display = 'flex'; } else { vid.play(); playBtn.style.display = 'none'; } });
    inner.appendChild(mediaWrap);
    m._mediaWrap = mediaWrap;

  } else if (m.type === 'audio') {
    const uid = 'a' + idx;
    const hasTr = m.transcript && (m.transcript.GCF || m.transcript.fr);
    const defaultLang = m.transcript && m.transcript.GCF ? 'GCF' : 'fr';
    inner.innerHTML = `
      <div class="audio-player" id="p${uid}">
        <div class="audio-icon" id="i${uid}">▶</div>
        <div class="audio-info">
          <div class="audio-title">${m.title || ''}</div>
          <div class="audio-bar-bg"><div class="audio-bar-fill" id="f${uid}"></div></div>
        </div>
      </div>
      ${hasTr ? `
      <div class="audio-transcript" id="tr${uid}">
        <button class="transcript-toggle" id="tog${uid}">▾ transcription</button>
        <div class="transcript-body" id="body${uid}" style="display:none">
          <div class="transcript-tabs">
            ${m.transcript.GCF ? `<button class="transcript-tab ${defaultLang === 'GCF' ? 'active' : ''}" data-lang="GCF" data-uid="${uid}">GCF</button>` : ''}
            ${m.transcript.fr ? `<button class="transcript-tab ${defaultLang === 'fr' ? 'active' : ''}" data-lang="fr" data-uid="${uid}">FR</button>` : ''}
          </div>
          <div class="transcript-text" id="txt${uid}">${(m.transcript[defaultLang] || '').replace(/\n/g, '<br>')}</div>
        </div>
      </div>` : ''}`;
    m._audioUid = uid;

  } else if (m.type === 'quote') {
    inner.className = 'quote-block';
    inner.innerHTML = `
      <blockquote class="quote-text">${(m.text || '').replace(/\n/g, '<br>')}</blockquote>
      ${m.author ? `<div class="quote-author">— ${m.author}${m.date ? `, <span class="quote-date">${m.date}</span>` : ''}</div>` : ''}
      ${m.source ? `<div class="quote-source">${m.source}</div>` : ''}
    `;
  }

  if (m.caption) {
    const cap = document.createElement('span');
    cap.className = 'media-caption';
    cap.innerHTML = m.caption;
    inner.appendChild(cap);
  }

  div.appendChild(inner);
  mediaLayer.appendChild(div);
  m._el = div;

  // ── Drag & drop ──────────────────────────────────────────────────────
  (function makeDraggable(el, mediaObj, mediaIdx) {
    let startX, startY, startLeft, startTop, dragging = false;

    function getPos() {
      // Lit la position courante en px (absolute dans mediaLayer)
      const rect = el.getBoundingClientRect();
      const prect = mediaLayer.getBoundingClientRect();
      return {
        left: rect.left - prect.left,
        top:  rect.top  - prect.top
      };
    }

    function onDown(e) {
      // Ignore si clic sur un bouton / player / toggle
      if (e.target.closest('.audio-player, .transcript-toggle, .transcript-tab, .vid-play-btn, button')) return;
      e.preventDefault();
      dragging = true;
      bringToFront(el);
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      const pos = getPos();
      startLeft = pos.left;
      startTop  = pos.top;

      // Passe en positionnement px absolu
      el.style.left   = startLeft + 'px';
      el.style.top    = startTop  + 'px';
      el.style.right  = 'auto';
      el.style.bottom = 'auto';
      el.style.cursor = 'grabbing';

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend',  onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      el.style.left = (startLeft + dx) + 'px';
      el.style.top  = (startTop  + dy) + 'px';
      updateLines();
    }

    function onUp() {
      dragging = false;
      el.style.cursor = 'grab';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
      logPosition(el, mediaIdx, mediaObj);
    }

    el.style.cursor = 'grab';
    el.addEventListener('mousedown',  onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
  })(div, m, idx);

  // ── Poignée de redimensionnement (image et vidéo uniquement) ────────
  // Ancrée sur le wrapper média (image/vidéo) plutôt que sur le bloc
  // entier, pour rester collée au coin bas-droit du média même quand
  // une légende est affichée en dessous.
  if ((m.type === 'image' || m.type === 'video') && m._mediaWrap)
  (function makeResizable(el, mediaWrap, mediaIdx) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.innerHTML = '';
    mediaWrap.appendChild(handle);

    let startX, startY, startW, dragging = false;

    function onDown(e) {
      e.preventDefault();
      e.stopPropagation(); // ne pas déclencher le drag du parent
      dragging = true;
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      startW = el.getBoundingClientRect().width;

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend',  onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      // Redimensionnement proportionnel : on suit le delta X (ou Y, le plus grand)
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const newW = Math.max(80, startW + delta);
      el.style.width = newW + 'px';
      updateLines();
    }

    function onUp() {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
      logPosition(el, mediaIdx, m);
    }

    handle.addEventListener('mousedown',  onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
  })(div, m._mediaWrap, idx);

  // Crée le filet SVG pour ce média
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.style.cssText = 'stroke:rgb(102,20,20);stroke-width:1;opacity:0;transition:opacity 0.45s ease;';
  svg.appendChild(line);
  m._line = line;
});

applyEditMode();

// Setup audio
medias.forEach((m, idx) => {
  if (m.type !== 'audio' || !m._audioUid) return;
  const uid = m._audioUid;
  const player = document.getElementById('p' + uid);
  const icon   = document.getElementById('i' + uid);
  const fill   = document.getElementById('f' + uid);
  if (!player) return;

  const audio = new Audio(m.src);
  let playing = false, rafId = null;

  function tick() {
    if (audio.duration) fill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    if (playing) rafId = requestAnimationFrame(tick);
  }

  audio.addEventListener('ended', () => {
    playing = false; icon.textContent = '▶';
    fill.style.width = '0%'; cancelAnimationFrame(rafId);
  });

  player.addEventListener('click', () => {
    if (playing) {
      audio.pause(); playing = false; icon.textContent = '▶'; cancelAnimationFrame(rafId);
    } else {
      document.querySelectorAll('.audio-player.playing').forEach(p => {
        p._audio.pause(); p._audio.currentTime = 0;
        p.querySelector('.audio-icon').textContent = '▶';
        p.querySelector('.audio-bar-fill').style.width = '0%';
        p.classList.remove('playing');
      });
      audio.play().catch(() => {});
      playing = true; icon.textContent = '■';
      rafId = requestAnimationFrame(tick);
      player.classList.add('playing');
      player._audio = audio;
    }
  });
});

// ── Calcule les coordonnées du filet ─────────────────────────────────
function updateLines() {
  medias.forEach(m => {
    if (!m._el || !m._line) return;

    const anchorIdx = m.anchor !== undefined ? m.anchor : m.after;
    const wordEl = wordEls[Math.min(anchorIdx, wordEls.length - 1)];
    if (!wordEl) return;

    const wRect = wordEl.getBoundingClientRect();
    const mRect = m._el.getBoundingClientRect();

    // Point de départ : milieu bas du mot
    const x1 = wRect.left + wRect.width / 2;
    const y1 = wRect.bottom;

    // Point d'arrivée : centre du média
    const x2 = mRect.left + mRect.width / 2;
    const y2 = mRect.top + mRect.height * 0.25;

    m._line.setAttribute('x1', x1);
    m._line.setAttribute('y1', y1);
    m._line.setAttribute('x2', x2);
    m._line.setAttribute('y2', y2);
  });
}

// ── Empilement des médias actifs ────────────────────────────────────
// Chaque média qui devient actif passe au-dessus de tous les autres,
// pour ne jamais être bloqué par un média précédent encore visible
// (fenêtres d'activation qui se chevauchent un peu).
let zCounter = 10;
function bringToFront(el) {
  zCounter++;
  el.style.zIndex = zCounter;
}

// ── Moteur de scroll ──────────────────────────────────────────────────
function onScroll() {
  const sy        = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = Math.min(sy / maxScroll * 100, 100) + '%';

  // Fond blanc → rouge
  // const progress = Math.min(sy / maxScroll, 1);
  // const g = Math.round(255 * (1 - progress));
  // const b = Math.round(255 * (1 - progress));
  // document.documentElement.style.setProperty('--rouge', `rgb(255,${g},${b})`);

  const totalWords = words.length;
  medias.forEach(m => {
    if (!m._el) return;
    const fromFrac = m.after / totalWords;
    const toFrac   = (m.after + (m.duration || 25)) / totalWords;
    const frac     = sy / maxScroll;
    const active   = frac >= fromFrac && frac < toFrac;

    if (active && !m._active) {
      m._el.classList.add('active');
      bringToFront(m._el);
      if (m._line) m._line.style.opacity = '1';
      // vidéo : ne pas autoplay, attendre le clic
      m._active = true;
    } else if (!active && m._active) {
      m._el.classList.remove('active');
      if (m._line) m._line.style.opacity = '0';
      if (m._vid) {
        m._vid.pause();
        // Réaffiche le bouton play si la vidéo était en cours
        const btn = m._el.querySelector('.vid-play-btn');
        if (btn) btn.style.display = 'flex';
      }
      m._active = false;
    }
  });

  updateLines();
}

// ── Gestion toggle + onglets de traduction ───────────────────────────
document.addEventListener('click', e => {
  // Toggle ouvert/fermé
  const tog = e.target.closest('.transcript-toggle');
  if (tog) {
    const uid = tog.id.replace('tog', '');
    const body = document.getElementById('body' + uid);
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    tog.textContent = open ? '▾ transcription' : '▴ transcription';
    return;
  }

  // Switch GCF / FR
  const btn = e.target.closest('.transcript-tab');
  if (!btn) return;
  const uid = btn.dataset.uid;
  const lang = btn.dataset.lang;
  const mediaObj = medias.find((_, i) => 'a' + i === uid);
  if (!mediaObj || !mediaObj.transcript) return;
  document.querySelectorAll(`.transcript-tab[data-uid="${uid}"]`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const txtEl = document.getElementById('txt' + uid);
  if (txtEl) txtEl.innerHTML = (mediaObj.transcript[lang] || '').replace(/\n/g, '<br>');
});

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => { updateLines(); onScroll(); });
onScroll();