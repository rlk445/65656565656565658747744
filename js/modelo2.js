/* Teste Modelo 2: a personagem em sprites 2D (pixelados) com todas as animações, num palco, interativa como o Teste Modelo 1.
   - Animações: movimento (parada de frente/lado/costas, correr, correr machucada, engatinhar, pular), combate (soco, chute, pisão, atirar, cair, levantar) e expressões do rosto.
   - Interação: dedos encostam e a personagem balança (mola); pince ou feche a mão perto dela (ou aponte de longe e pince / clique / toque) para pegar, carregar e soltar (cai e quica).
   - Opcional: golpe forte derruba (toca "cair" e depois "levantar"), ciclo automático por todas as animações, andar sozinha ao correr.
   Cada animação é uma folha de sprites em assets/modelo2/<nome>.png (carregada só quando usada). */
(() => {
'use strict';
const VR = window.VR, T = VR.T, S = VR.S, scene = VR.scene, HEAD = VR.HEAD, ui = VR.ui, H = VR.H, W = VR.world;
const clamp = VR.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));
const m2 = VR.modelo2 = { on: false, ready: false, loading: 0, err: '' };
const PATH = 'assets/modelo2/', TARGET_H = 1.55, PXM = TARGET_H / 224;       // metros por pixel (a parada tem 224 px de altura)

// folhas de sprites: [quadros, largura, altura, colunas, linhas]
const ATLAS_RAW = {"die":[78,280,216,14,6],"fire_gun":[2,136,214,2,1],"kick":[60,199,169,20,3],"punch":[102,162,220,25,5],"recover":[60,218,225,18,4],"stomp":[56,182,220,22,3],"expressions":[9,52,224,9,1],"crawling":[70,176,66,23,4],"idle_down":[60,53,224,60,1],"idle_side":[60,56,224,60,1],"idle_up":[60,52,223,60,1],"injured_run":[30,133,218,30,1],"jump":[50,103,225,39,2],"run":[76,129,220,31,3]};
const ATLAS = {}; Object.keys(ATLAS_RAW).forEach(k => { const a = ATLAS_RAW[k]; ATLAS[k] = { n: a[0], w: a[1], h: a[2], cols: a[3], rows: a[4] }; });

// chave, nome, grupo, quadros/s, repete, sentido original (+1 = olha para a direita), depois
const ANIM_LIST = [
  ['idle_down', 'Parada: de frente', 'mov', 30, true, 1], ['idle_side', 'Parada: de lado', 'mov', 30, true, 1], ['idle_up', 'Parada: de costas', 'mov', 30, true, 1],
  ['run', 'Correr', 'mov', 30, true, 1], ['injured_run', 'Correr machucada', 'mov', 24, true, 1], ['crawling', 'Engatinhar', 'mov', 24, true, 1], ['jump', 'Pular', 'mov', 30, false, 1],
  ['punch', 'Soco', 'cmb', 30, false, 1], ['kick', 'Chute', 'cmb', 30, false, 1], ['stomp', 'Pisão', 'cmb', 30, false, 1], ['fire_gun', 'Atirar', 'cmb', 5, false, -1],
  ['die', 'Cair', 'cmb', 30, false, 1], ['recover', 'Levantar', 'cmb', 30, false, 1],
  ['expressions', 'Expressões do rosto', 'exp', 1, false, 1]
];
// sequências de quadros soltos (pasta com tile000.png, tile001.png...): [id, pasta, nome no menu, quadros, repete, depois]
const SEQ_LIST = [
  ['seq_1_loop', '1_loop - pixelated', 'Sequência 1 (loop)', 20, true, ''], ['seq_1_climax', '1_climax - pixelated', 'Sequência 1 (clímax)', 17, false, 'seq_climax_end'],
  ['seq_2_loop', '2_loop - pixelated', 'Sequência 2 (loop)', 40, true, ''], ['seq_2_climax', '2_climax - pixelated', 'Sequência 2 (clímax)', 27, false, 'seq_climax_end'],
  ['seq_3_loop', '3_loop - pixelated', 'Sequência 3 (loop)', 40, true, ''], ['seq_3_climax', '3_climax - pixelated', 'Sequência 3 (clímax)', 27, false, 'seq_climax_end'],
  ['seq_climax_end', 'climax_end - pixelated', 'Final (climax_end)', 40, false, ''], ['seq_ma', 'ma - pixelated', 'Sequência MA', 16, true, '']
];
const SEQ_FPS = 24, SEQ_MAX_H = 2.2, SEQ_MAX_W = 2.6;                          // limites em metros para caber no palco
SEQ_LIST.forEach(q => { ATLAS[q[0]] = { n: q[3], w: 1, h: 1, cols: 1, rows: 1, seq: q[1] }; ANIM_LIST.push([q[0], q[2], 'seq', SEQ_FPS, q[4], 1, q[5]]); });
const A = {}; ANIM_LIST.forEach(a => { A[a[0]] = { key: a[0], label: a[1], grp: a[2], fps: a[3], loop: a[4], dir: a[5], next: a[6] || '' }; });
const FACES = ['Neutra', 'Olhar de lado', 'Boca aberta', 'Surpresa', 'Olhos fechados', 'Envergonhada', 'Beijinho', 'Piscadinha', 'Espanto'];
const AUTO = ['idle_down', 'run', 'jump', 'punch', 'kick', 'stomp', 'fire_gun', 'injured_run', 'crawling', 'die', 'recover', 'idle_side', 'idle_up'];
const WALK = { run: 1.4, injured_run: 0.9, crawling: 0.45 };                   // m/s ao andar sozinha

m2.DEF = { m2Scale: 1, m2Dist: 2.0, m2Flip: false, m2Speed: 1, m2Loop: false, m2Pause: false, m2Auto: false, m2Walk: true, m2Smooth: false, m2Expr: 0, m2Touch: true, m2Stiff: 1, m2Knock: false, m2Box: false };
for (const k in m2.DEF) if (!(k in S)) S[k] = m2.DEF[k];

// ---------- estado ----------
const st = { key: 'idle_down', f: 0, hold: 0, after: '', knock: false, idle: 'idle_down', want: '', loops: 0, autoI: 0, face: 1,
  P: new T.Vector3(0, 0, -2), V: new T.Vector3(), roll: 0, rollV: 0, pitch: 0, pitchV: 0, sq: 0, sqV: 0, ox: 0, oz: 0, oxV: 0, ozV: 0, yaw: 0, grabs: [null, null, null], lastP: new T.Vector3(), t: 0, sfx: 0 };
m2.st = st;
const tex = {}, pend = {};
let root, tilt, mesh, mat, shadow, box, stage, built = false;
const V1 = new T.Vector3(), V2 = new T.Vector3(), V3 = new T.Vector3(), hoverPt = new T.Vector3();

// ---------- criação ----------
function build() {
  if (built) return; built = true;
  root = new T.Group(); root.visible = false; scene.add(root);                  // fica na posição da personagem (pés no chão) e olha para o jogador
  tilt = new T.Group(); root.add(tilt);
  mat = new T.MeshBasicMaterial({ transparent: true, alphaTest: 0.08, side: T.DoubleSide, toneMapped: false, color: 0xffffff });
  mesh = new T.Mesh(new T.PlaneGeometry(1, 1).translate(0, 0.5, 0), mat); mesh.frustumCulled = false; tilt.add(mesh);
  stage = new T.Group(); scene.add(stage); stage.visible = false;
  const disc = new T.Mesh(new T.CircleGeometry(1.0, 56), new T.MeshLambertMaterial({ color: 0x1a1d2b })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002; stage.add(disc);
  const ring = new T.Mesh(new T.RingGeometry(1.0, 1.04, 64), new T.MeshBasicMaterial({ color: 0x6f8cff })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; stage.add(ring);
  const floor = new T.Mesh(new T.CircleGeometry(9, 48), new T.MeshLambertMaterial({ color: 0x0e1018 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.001; stage.add(floor);
  shadow = new T.Mesh(new T.CircleGeometry(0.32, 28), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.007; stage.add(shadow);
  box = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new T.LineBasicMaterial({ color: 0x66ffcc, depthTest: false })); box.visible = false; root.add(box);
}
function applyFilter() {
  const f = S.m2Smooth ? T.LinearFilter : T.NearestFilter;
  for (const k in tex) [].concat(tex[k]).forEach(x => { x.minFilter = x.magFilter = f; x.needsUpdate = true; });
  if (mat) mat.alphaTest = S.m2Smooth ? 0.3 : 0.08;
}
m2.applyFilter = applyFilter;
const prog = {};
function loadSeq(key, cb) {                                                    // carrega todos os quadros da pasta; o tamanho vem de cada imagem na hora
  const m = ATLAS[key], imgs = new Array(m.n); let ok = 0, bad = false; prog[key] = 0;
  const fin = () => {
    let mw = 1, mh = 1; imgs.forEach(i => { mw = Math.max(mw, i.naturalWidth); mh = Math.max(mh, i.naturalHeight); });
    const fit = Math.min(1, SEQ_MAX_H / (mh * PXM), SEQ_MAX_W / (mw * PXM));
    m.fw = imgs.map(i => i.naturalWidth * fit); m.fh = imgs.map(i => i.naturalHeight * fit); m.w = mw * fit; m.h = mh * fit;
    tex[key] = imgs.map(i => { const tx = new T.Texture(i); tx.colorSpace = T.SRGBColorSpace; tx.generateMipmaps = false; tx.minFilter = tx.magFilter = S.m2Smooth ? T.LinearFilter : T.NearestFilter; tx.needsUpdate = true; return tx; });
    m2.loading--; delete prog[key]; const q = pend[key]; delete pend[key]; q.forEach(f => { if (f) f(); }); refreshPanel();
  };
  imgs.forEach((_, i) => {
    const img = new Image(); imgs[i] = img;
    img.onload = () => { prog[key] = ++ok; if (ok === m.n) fin(); else if (ok % 5 === 0) refreshPanel(); };
    img.onerror = () => { if (bad) return; bad = true; m2.loading--; m2.err = 'não carregou ' + m.seq + ' (quadro ' + i + ')'; delete pend[key]; delete prog[key]; VR.log('modelo2: ' + m2.err); refreshPanel(); };
    img.src = encodeURI(PATH + m.seq + '/tile' + String(i).padStart(3, '0') + '.png') + '?v=1';
  });
}
function loadAnim(key, cb) {
  if (tex[key]) { if (cb) cb(); return; }
  if (pend[key]) { pend[key].push(cb); return; }
  pend[key] = [cb]; m2.loading++; refreshPanel();
  if (ATLAS[key].seq) { loadSeq(key); return; }
  const img = new Image();
  img.onload = () => {
    const m = ATLAS[key], tx = new T.Texture(img); tx.colorSpace = T.SRGBColorSpace; tx.generateMipmaps = false; tx.repeat.set(1 / m.cols, 1 / m.rows);
    tx.minFilter = tx.magFilter = S.m2Smooth ? T.LinearFilter : T.NearestFilter; tx.needsUpdate = true; tex[key] = tx; m2.loading--;
    const q = pend[key]; delete pend[key]; q.forEach(f => { if (f) f(); }); refreshPanel();
  };
  img.onerror = () => { m2.loading--; m2.err = 'não carregou ' + key + '.png'; delete pend[key]; VR.log('modelo2: ' + m2.err); refreshPanel(); };
  img.src = PATH + key + '.png?v=1';
}
function refreshPanel() { const p = ui.panels && ui.panels.modelo2; if (p) p.dirty = true; }
function init() {
  build(); if (m2.ready || m2.initing) return; m2.initing = true;
  loadAnim('idle_down', () => { m2.ready = true; m2.initing = false; st.key = 'idle_down'; st.f = 0; applyFrame(true); VR.log('modelo2: pronto'); const p = ui.panels && ui.panels.modelo2; if (p && p.rebuild) p.rebuild(); });
}

// ---------- animação ----------
const idleKey = () => st.idle || 'idle_down';
function play(key) {
  const d = A[key]; if (!d) return false; st.want = key;
  loadAnim(key, () => {
    if (st.want !== key) return;
    st.key = key; st.f = 0; st.hold = 0; st.after = ''; st.loops = 0; if (key.indexOf('idle') === 0) st.idle = key;
    if (ATLAS[key].seq) st.face = 1;
    if (key !== 'die') st.knock = false;
    applyFrame(true); refreshPanel();
  });
  return true;
}
m2.play = play;
function autoNext() { st.autoI = (st.autoI + 1) % AUTO.length; play(AUTO[st.autoI]); }
function done() {                                                               // acabou uma animação que não repete
  const nx = A[st.key] && A[st.key].next; if (nx) { play(nx); return; }
  if (st.after) { const a = st.after; st.after = ''; play(a); return; }
  if (S.m2Auto) { autoNext(); return; }
  play(idleKey());
}
function advance(dt) {
  const d = A[st.key], m = ATLAS[st.key]; if (!d || !m || !tex[st.key]) return;
  if (st.key === 'expressions') { st.f = clamp(Math.round(S.m2Expr || 0), 0, m.n - 1); return; }
  if (S.m2Pause) return;
  if (st.hold > 0) { st.hold -= dt; if (st.hold <= 0) done(); return; }
  st.f += d.fps * (S.m2Speed || 1) * dt;
  if (st.f < m.n) return;
  if (d.loop || (S.m2Loop && st.key !== 'die' && !d.next)) { st.f %= m.n; st.loops++; if (S.m2Auto && st.loops >= 2) autoNext(); return; }
  st.f = m.n - 1;
  if (st.key === 'die') { if (st.knock || S.m2Auto) { st.hold = 0.9; st.after = 'recover'; st.knock = false; } return; }   // cai e fica no chão até pedir "levantar"
  st.hold = st.key === 'fire_gun' ? 0.35 : 0.05;
}
function applyFrame(force) {
  const m = ATLAS[st.key], tx0 = tex[st.key]; if (!m || !tx0 || !mat) return;
  const i = clamp(Math.floor(st.f), 0, m.n - 1), c = i % m.cols, r = Math.floor(i / m.cols), tx = m.seq ? tx0[i] : tx0;
  if (mat.map !== tx) { mat.map = tx; mat.needsUpdate = true; }
  if (!m.seq) tx.offset.set(c / m.cols, 1 - (r + 1) / m.rows);
  const d = A[st.key], sg = st.face * (S.m2Flip ? -1 : 1) * d.dir, sc = S.m2Scale || 1, fw = m.seq ? m.fw[i] : m.w, fh = m.seq ? m.fh[i] : m.h;
  mesh.scale.set(fw * PXM * sc * sg * (1 - st.sq * 0.5), fh * PXM * sc * (1 + st.sq), 1);
}
const dims = () => { const m = ATLAS[st.key] || ATLAS.idle_down, sc = S.m2Scale || 1; return { w: m.w * PXM * sc, h: m.h * PXM * sc }; };

// ---------- geometria de toque (espaço da personagem: x = direita, y = altura, z = para o jogador) ----------
function toLocal(p, out) {
  V1.copy(p).sub(st.P); const c = Math.cos(st.yaw), s = Math.sin(st.yaw);
  return out.set(V1.x * c - V1.z * s, V1.y, V1.x * s + V1.z * c);
}
function toLocalDir(v, out) { const c = Math.cos(st.yaw), s = Math.sin(st.yaw); return out.set(v.x * c - v.z * s, v.y, v.x * s + v.z * c); }
function pickRay(o, d) {
  if (!root || !root.visible) return null;
  const n = V2.set(Math.sin(st.yaw), 0, Math.cos(st.yaw)), den = d.dot(n); if (Math.abs(den) < 1e-4) return null;
  const t = V3.copy(st.P).sub(o).dot(n) / den; if (t < 0.1 || t > 12) return null;
  const pt = new T.Vector3().copy(o).addScaledVector(d, t), lp = toLocal(pt, new T.Vector3()), q = dims();
  if (Math.abs(lp.x) < q.w * 0.5 * 0.85 + 0.03 && lp.y > -0.03 && lp.y < q.h + 0.03) return { pt, t };
  return null;
}
function nearHand(p) {
  const lp = toLocal(p, new T.Vector3()), q = dims();
  return Math.abs(lp.z) < 0.16 && Math.abs(lp.x) < q.w * 0.5 * 0.9 + 0.05 && lp.y > -0.08 && lp.y < q.h + 0.08;
}

// ---------- pegar e soltar ----------
function startGrab(i, s, pt, mode, dist) {
  if (st.grabs[0] || st.grabs[1] || st.grabs[2]) return false;
  const g = { i, s, mode, dist: dist || 1, off: new T.Vector3().subVectors(st.P, pt) };
  st.grabs[i] = g; st.V.set(0, 0, 0); st.lastP.copy(st.P); ui.sfx && ui.sfx(300, 0.05, 0.25); return true;
}
function releaseGrab(i) {
  const g = st.grabs[i]; if (!g) return; st.grabs[i] = null;
  const v = st.V; if (v.length() > 4) v.setLength(4); ui.sfx && ui.sfx(240, 0.05, 0.2);
}
function releaseAll() { for (let i = 0; i < 3; i++) releaseGrab(i); }
m2.releaseAll = releaseAll;
const gripPrev = [false, false];
function updateGrabs(dt) {
  let any = false;
  for (let i = 0; i < 3; i++) {
    const s = i === 2 ? VR.MH : H[i]; let g = st.grabs[i];
    if (i < 2) {
      const grip = !!(s.vis && s.on && (s.pinch || s.fist)), edge = grip && !gripPrev[i]; gripPrev[i] = grip;
      if (g && !grip) { releaseGrab(i); continue; }
      if (!g && edge && S.m2Touch && !s.held && !s.uiHover && !s.busy && nearHand(s.anchor)) { if (startGrab(i, s, s.anchor, 'near')) { s.busy = true; g = st.grabs[i]; } }
    } else if (g && !s.pinch) { releaseGrab(i); continue; }
    g = st.grabs[i]; if (!g) continue; any = true;
    const tg = g.mode === 'near' ? V1.copy(s.anchor) : V1.copy(i === 2 ? ui.mouse.o : HEAD).addScaledVector(i === 2 ? ui.mouse.d : s.aim, g.dist);
    V2.copy(tg).add(g.off); const b = VR.bounds || { x0: -6, x1: 6, z0: -8, z1: 4 };
    V2.x = clamp(V2.x, b.x0, b.x1); V2.z = clamp(V2.z, b.z0, b.z1); V2.y = clamp(V2.y, 0, 2.6);
    const k = Math.min(1, dt * 18); st.lastP.copy(st.P); st.P.lerp(V2, k);
    if (dt > 0) st.V.copy(st.P).sub(st.lastP).multiplyScalar(1 / dt);
  }
  return any;
}

// ---------- queda e balanço ----------
function physics(dt, held) {
  if (!held) {
    const P = st.P, V = st.V;
    if (P.y > 0 || V.y > 0 || V.lengthSq() > 1e-4) {
      V.y -= 9.8 * dt; P.addScaledVector(V, dt);
      if (P.y <= 0) { P.y = 0; if (V.y < -1.5) { V.y *= -0.28; st.sqV -= Math.min(2.5, -V.y * 2.2); ui.sfx && ui.sfx(130, 0.06, 0.2); } else V.y = 0; const f = Math.exp(-5 * dt); V.x *= f; V.z *= f; }
      const b = VR.bounds || { x0: -6, x1: 6, z0: -8, z1: 4 }; P.x = clamp(P.x, b.x0, b.x1); P.z = clamp(P.z, b.z0, b.z1);
    }
  } else {
    toLocalDir(st.V, V3); st.rollV += -V3.x * 3.2 * dt; st.pitchV += V3.z * 2.2 * dt;     // pendura e balança conforme a mão se mexe
  }
  const k = 55 * (S.m2Stiff || 1), c = 5.5 * Math.sqrt(S.m2Stiff || 1);
  st.rollV += (-k * st.roll - c * st.rollV) * dt; st.roll = clamp(st.roll + st.rollV * dt, -0.9, 0.9);
  st.pitchV += (-k * st.pitch - c * st.pitchV) * dt; st.pitch = clamp(st.pitch + st.pitchV * dt, -0.7, 0.7);
  st.sqV += (-130 * st.sq - 9 * st.sqV) * dt; st.sq = clamp(st.sq + st.sqV * dt, -0.35, 0.3);
  st.oxV += (-90 * st.ox - 7 * st.oxV) * dt; st.ox = clamp(st.ox + st.oxV * dt, -0.25, 0.25);
  st.ozV += (-90 * st.oz - 7 * st.ozV) * dt; st.oz = clamp(st.oz + st.ozV * dt, -0.25, 0.25);
}

// ---------- dedos encostando ----------
const HP = [[4, 0.014], [8, 0.012], [12, 0.012], [16, 0.012], [20, 0.011], [9, 0.04], [0, 0.03]], TP = [];
for (let h = 0; h < 2; h++) HP.forEach(([i, r]) => TP.push({ h, i, r, p: new T.Vector3(), prev: new T.Vector3(), v: new T.Vector3(), has: false, inside: false }));
function touch(dt) {
  const q = dims(), inv = dt > 0 ? 1 / dt : 0;
  TP.forEach(t => {
    const s = H[t.h], on = !!(S.m2Touch && s.vis && s.on && !st.grabs[t.h]);
    if (!on) { t.has = false; t.inside = false; return; }
    VR.toWorld(t.p, s.P[t.i]);
    if (t.has) { V1.subVectors(t.p, t.prev).multiplyScalar(inv); if (V1.length() > 6) V1.setLength(6); t.v.lerp(V1, 0.5); } else t.v.set(0, 0, 0);
    t.prev.copy(t.p); t.has = true;
    const lp = toLocal(t.p, new T.Vector3()), lv = toLocalDir(t.v, new T.Vector3());
    const ins = Math.abs(lp.z) < 0.05 + t.r && Math.abs(lp.x) < q.w * 0.5 * 0.85 + t.r && lp.y > -0.02 && lp.y < q.h;
    if (ins) {
      const hy = clamp(lp.y / q.h, 0, 1), sp = t.v.length();
      st.rollV += clamp(-lv.x * 5, -9, 9) * hy * dt * 6; st.pitchV += clamp(lv.z * 4, -8, 8) * hy * dt * 6; st.oxV += lv.x * 0.9 * dt * 6; st.ozV += lv.z * 0.9 * dt * 6;
      if (!t.inside) {
        st.sqV -= Math.min(Math.abs(lv.z), 3) * 0.9; st.rollV += clamp(-lv.x * 2, -6, 6) * hy;
        if (sp > 0.35 && st.t - st.sfx > 0.14) { st.sfx = st.t; ui.sfx && ui.sfx(170 + Math.min(sp, 2.5) * 90 + Math.random() * 40, 0.035, 0.18); }
        if (S.m2Knock && sp > 3 && st.key !== 'die' && st.key !== 'recover') { st.knock = true; play('die'); }
      }
    }
    t.inside = ins;
  });
}

// ---------- quadro a quadro ----------
m2.update = (dt, t) => {
  if (!m2.on || !built || !root.visible) return;
  dt = Math.min(dt, 0.05); st.t += dt;
  const held = updateGrabs(dt);
  if (m2.ready) {
    advance(dt);
    const d = A[st.key], sp = WALK[st.key];
    if (S.m2Walk && sp && !held && st.P.y <= 0.001 && !S.m2Pause) {                // anda sozinha ao correr / engatinhar
      st.P.x += st.face * sp * (S.m2Speed || 1) * dt; const lim = 1.7;
      if (st.P.x > lim) { st.P.x = lim; st.face = -1; } else if (st.P.x < -lim) { st.P.x = -lim; st.face = 1; }
    }
  }
  physics(dt, held);
  st.yaw = Math.atan2(HEAD.x - st.P.x, HEAD.z - st.P.z);
  root.position.copy(st.P); root.rotation.y = st.yaw;
  if (m2.ready) touch(dt);
  tilt.rotation.z = st.roll; tilt.rotation.x = st.pitch; tilt.position.set(st.ox, 0, st.oz);
  applyFrame(false);
  const hh = Math.min(1, st.P.y / 1.5); shadow.position.set(st.P.x, 0.007, st.P.z); shadow.scale.setScalar(Math.max(0.35, 1 - hh * 0.6) * Math.max(0.6, (dims().w / 0.55)));
  shadow.material.opacity = 0.4 * (1 - hh * 0.7);
  box.visible = !!S.m2Box; if (S.m2Box) { const q = dims(); box.scale.set(q.w * 0.85, q.h, 0.1); }
};
function resetPos() { releaseAll(); st.P.set(0, 0, -(S.m2Dist || 2)); st.V.set(0, 0, 0); st.face = 1; st.roll = st.pitch = st.sq = st.ox = st.oz = 0; st.rollV = st.pitchV = st.sqV = st.oxV = st.ozV = 0; }
m2.reset = () => { for (const k in m2.DEF) S[k] = m2.DEF[k]; resetPos(); applyFilter(); st.hold = 0; st.after = ''; play('idle_down'); VR.save(); refreshPanel(); };

// ---------- ponteiro (mouse, toque ou mão apontando de longe) ----------
const _pointer = W.pointer, _peek = W.peek;
W.pointer = (p, press, s) => {
  const r = _pointer(p, press, s);
  if (r || !m2.on || !S.m2Touch || !m2.ready || S.pass) return r;
  const i = p.idx, hand = i < 2 ? H[i] : null;
  if (hand && (hand.held || hand.busy)) return r;
  let pt = null, mode = 'ray', dist = 1, hit = pickRay(p.o, p.d);
  if (hand && press && nearHand(hand.anchor)) { pt = hand.anchor; mode = 'near'; }
  else if (hit) { pt = hit.pt; dist = hit.t; }
  if (!pt) return null;
  if (press && s && !s.held) { if (startGrab(i, s, pt, mode, dist) && s) s.busy = i < 2; }
  if (hit) { hoverPt.copy(hit.pt); return { point: hoverPt, kind: 'prop' }; }
  return null;
};
W.peek = (o, d) => _peek(o, d) || !!(m2.on && S.m2Touch && m2.ready && !S.pass && pickRay(o, d));

// ---------- ambiente ----------
m2.setVisible = (on, pass) => { m2.on = on; if (built) { root.visible = on && !pass; stage.visible = on && !pass; } if (on) init(); if (!on || pass) releaseAll(); };
m2.enter = () => { m2.on = true; init(); if (built) { root.visible = true; stage.visible = true; } resetPos(); VR.bounds = { x0: -6, x1: 6, z0: -8, z1: 4 }; };
m2.exit = () => { m2.on = false; if (built) { root.visible = false; stage.visible = false; } releaseAll(); if (ui.panels.modelo2) ui.show(ui.panels.modelo2, false); };
VR.hook(52, (dt, t) => { if (m2.on) { try { m2.update(dt, t); } catch (e) { if (!m2._e) { m2._e = 1; VR.log('modelo2: ' + e.message); } } } });

// ---------- painel ----------
const R = {
  head: label => ({ t: 'head', h: 58, label }),
  toggle: (label, key, o = {}) => Object.assign({ t: 'toggle', h: o.sub ? 90 : 80, label, get: () => !!S[key], set: v => { S[key] = v; } }, o),
  slider: (label, key, min, max, step, fmt, o = {}) => Object.assign({ t: 'slider', h: 106, label, min, max, step, fmt, get: () => S[key], set: v => { S[key] = v; } }, o),
  button: (label, onClick, o = {}) => Object.assign({ t: 'button', h: 80, label, onClick }, o)
};
const pct = v => Math.round(v * 100) + '%';
function animRows(grp) {
  return ANIM_LIST.filter(a => a[2] === grp).map(a => R.button(a[1], () => { if (a[0] === 'expressions') S.m2Expr = S.m2Expr || 0; play(a[0]); },
    { chev: false, val: () => (st.key === a[0] ? '● ativa' : (pend[a[0]] ? 'carregando…' + (prog[a[0]] != null ? ' ' + prog[a[0]] + '/' + ATLAS[a[0]].n : '') : '')) }));
}
ui.panel({ id: 'modelo2', mw: 1.0, mh: 0.96, primary: true, title: 'Teste Modelo 2', titleIcon: 'cube', dist: 1.15, dy: 0.04, dx: 0.45, order: 11,
  onOpen: p => { ui.lastPrimary = 'modelo2'; p.rebuild(); },
  extra(g, p) { if (!m2.ready) ui.text(g, m2.err ? 'Erro: ' + m2.err : 'Carregando a personagem…', p.W / 2, 60, 24, m2.err ? '#ff8a8a' : '#ffd166', 'center', 600); },
  build(p) {
    p.sc = { x: 24, y: 92, w: 640, h: p.H - 112 };
    const rows = [
      R.head('Posição'),
      R.slider('Tamanho', 'm2Scale', 0.5, 1.8, 0.05, pct), R.slider('Distância', 'm2Dist', 0.9, 4, 0.1, v => v.toFixed(1) + ' m', { on: () => { if (!st.grabs[0] && !st.grabs[1] && !st.grabs[2]) st.P.z = -(S.m2Dist || 2); } }),
      R.toggle('Espelhar (virar para o outro lado)', 'm2Flip'),
      R.button('Voltar para o centro', () => { resetPos(); }, { icon: 'refresh' }),
      R.head('Movimento (toque para executar)'), ...animRows('mov'),
      R.head('Combate'), ...animRows('cmb'),
      R.head('Sequências (toque para executar)'), ...animRows('seq'),
      R.button('Parar sequência (voltar à parada)', () => { play(idleKey()); }, { icon: 'refresh' }),
      R.head('Expressões do rosto'), ...animRows('exp'),
      R.slider('Rosto', 'm2Expr', 0, FACES.length - 1, 1, v => FACES[clamp(Math.round(v), 0, FACES.length - 1)], { on: () => { if (st.key !== 'expressions') play('expressions'); } }),
      R.head('Reprodução'),
      R.slider('Velocidade', 'm2Speed', 0.25, 2.5, 0.05, v => v.toFixed(2) + '×'),
      R.toggle('Pausar', 'm2Pause'),
      R.toggle('Repetir golpes e pulo', 'm2Loop', { sub: 'Soco, chute, pisão, tiro e pulo ficam em loop' }),
      R.toggle('Ciclo automático', 'm2Auto', { sub: 'Passa sozinha por todas as animações' }),
      R.toggle('Andar sozinha ao correr', 'm2Walk', { sub: 'Correr, correr machucada e engatinhar saem do lugar' }),
      R.toggle('Pixels suaves', 'm2Smooth', { sub: 'Desligado = pixel art nítida', on: () => applyFilter() }),
      R.head('Interação'),
      R.toggle('Tocar, empurrar e pegar', 'm2Touch', { sub: 'Dedos balançam ela; pince ou feche a mão perto para pegar e carregar; solte e ela cai' }),
      R.slider('Rigidez do balanço', 'm2Stiff', 0.4, 2.5, 0.1, v => v.toFixed(1) + '×'),
      R.toggle('Golpe forte derruba', 'm2Knock', { sub: 'Um tapa rápido toca "Cair" e depois "Levantar"' }),
      R.toggle('Mostrar área de toque', 'm2Box', { sub: 'Caixa verde = onde dá para encostar' }),
      R.button('Restaurar tudo', () => m2.reset(), { icon: 'refresh' })
    ];
    return p.layoutRows(rows, 24, 640, 10);
  } });
})();
