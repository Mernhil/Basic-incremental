/* Mockup helpers: injects the shell and builds cards. Static pages, no game code. Real sprites
   from src/renderer/src/art/pixel/sprites stand in wherever art does not exist yet. */
const MK = (() => {
  const SPR = '../../../src/renderer/src/art/pixel/sprites/';
  const R = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic', exotic: 'Exotic', void: 'Void' };
  const img = (n, w, h, cls = '', st = '') => `<img class="pix ${cls}" src="${SPR}${n}.png" width="${w}" height="${h ?? w}" style="${st}" alt="">`;
  const ICON = {
    money: img('coin-round-gold', 26), summon: img('coin-drop-silver', 26), glamour: img('coin-pentagon-prism', 26),
    starlight: img('cos-starlight-a', 26), shard: img('coin-hexagon-prism', 26), oak: img('coin-round-bronze', 26),
  };
  const NAV = [['home', 'Home'], ['cards', 'Cards'], ['production', 'Production'], ['dungeons', 'Dungeons'], ['summon', 'Summon'], ['skills', 'Skill Tree'], ['wardrobe', 'Wardrobe'], ['achievements', 'Achievements'], ['shop', 'Shop'], ['settings', 'Settings']];
  const pill = (ico, v, label, hot = false) => `<div class="mk-pill ${hot ? 'hot' : ''}">${ico}<div class="num">${v}<small>${label}</small></div></div>`;
  function shell(page, main, o = {}) {
    const pills = o.pills ?? [pill(ICON.oak, '55,907', 'Oak Gem'), pill(ICON.summon, '135', 'Summon Crystals', page === 'summon'), pill(ICON.glamour, '38', 'Glamour Crystals'), pill(ICON.starlight, '23', 'Starlight', page === 'shop')];
    document.getElementById('app').innerHTML = `
    <div class="mk-app ${o.cls ?? ''}" style="${o.style ?? ''}">
      <header class="mk-head"><div class="mk-brand">Basic Incremental<small>v0.2.3</small></div>
        <div class="mk-lvl"><b>1</b><div>Account level 1<i></i></div></div><div class="mk-pills">${pills.join('')}</div></header>
      <nav class="mk-rail" aria-label="Pages">${NAV.map(([id, n]) => `<div class="${id === page ? 'on' : ''}"><img src="${SPR}plaque-${id}.png" alt="">${n}</div>`).join('')}</nav>
      <main class="mk-main" id="main">${main}</main>
      <button class="mk-play" id="mkplay">${o.play ?? 'Play the motion'}</button>
    </div>`;
    const q = new URLSearchParams(location.search);
    if (q.get('frozen')) document.documentElement.classList.add('frozen');
    const app = document.querySelector('.mk-app');
    if (q.get('state') === 'play') app.classList.add('play');
    document.getElementById('mkplay').onclick = () => {
      app.classList.remove('play'); void app.offsetWidth; app.classList.add('play');
      if (o.onPlay) o.onPlay(app);
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') app.classList.remove('play'); });
    return app;
  }
  const CARDS = {
    ember_squire: ['Ember Squire', 'Fighting', 'common', 'sword'], apprentice_feller: ['Apprentice Feller', 'Logging', 'common', 'hatchet'], cave_digger: ['Cave Digger', 'Mining', 'common', 'pickaxe'],
    shield_warden: ['Shield Warden', 'Fighting', 'rare', 'shield'], grove_keeper: ['Grove Keeper', 'Logging', 'rare', 'staff'], gem_cutter: ['Gem Cutter', 'Mining', 'rare', 'chisel'],
    storm_duelist: ['Storm Duelist', 'Fighting', 'epic', 'twin_blades'], elder_treant: ['Elder Treant', 'Logging', 'epic', 'maul'],
    dawnblade_regent: ['Dawnblade Regent', 'Fighting', 'legendary', 'greatsword'], geode_golem: ['Geode Golem', 'Mining', 'legendary', 'geode_hammer'],
    moonwood_dryad: ['Moonwood Dryad', 'Logging', 'mythic', 'bow'], core_titan: ['Core Titan', 'Mining', 'exotic', 'gauntlet'],
  };
  function card(id, o = {}) {
    const [name, kind, rar, item] = CARDS[id];
    const k = o.k ?? 1;
    if (o.back) return `<div class="mk-card back rc-${rar}" style="--k:${k};${o.style ?? ''}">${img('frame-bronze', 183, 237, 'fr')}</div>`;
    return `<div class="mk-card rc-${rar}" style="--k:${k};--cb:var(--b-${rar});${o.style ?? ''}">
      <div class="p">${name}<em>${kind}</em></div>
      <div class="a">${img('item-' + item + '-' + rar, 100, 120)}</div>
      <div class="s"><div>Level<small>1 / 20</small></div><div>Hits every<small>1s</small></div></div>
      <div class="f"><span>Bronze</span><b>&#9733;&#9734;&#9734;&#9734;&#9734;&#9734;</b></div>
      ${img('frame-bronze', 183, 237, 'fr')}${o.tag ? `<span class="mk-tag">${o.tag}</span>` : ''}</div>`;
  }
  return { SPR, R, img, ICON, shell, card, pill, CARDS };
})();
