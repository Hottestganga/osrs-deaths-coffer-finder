let allRows = [];
let scan = null;
let sortKey = 'practicalScore';
let sortDir = -1;
let nextRefreshAt = Date.now() + 60000;
let autoTimer = null;
let activePreset = 'all';

const $ = id => document.getElementById(id);
const gp = n => Number(n || 0).toLocaleString('en-AU') + ' gp';
const num = n => Number(n || 0).toLocaleString('en-AU');
const compactGp = n => {
  const value = Number(n || 0);
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 1 : 2) + 'b';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2) + 'm';
  if (value >= 1_000) return (value / 1_000).toFixed(value >= 100_000 ? 0 : 1) + 'k';
  return num(value);
};
const confidenceRank = {Low:1, Fair:2, Good:3, High:4, Excellent:5};
const savedFiltersKey = 'cofferFinderV4Filters';

async function load(force = false) {
  $('status').textContent = force ? 'Refreshing the full market…' : 'Scanning the full live GE market…';
  $('refresh').disabled = true;
  $('errorBox').hidden = true;
  try {
    const res = await fetch('/api/coffer?refresh=' + force, {cache:'no-store'});
    if (!res.ok) {
      let msg = `Server returned ${res.status}`;
      try { msg += ': ' + (await res.text()).slice(0, 300); } catch (_) {}
      throw new Error(msg);
    }
    scan = await res.json();
    allRows = scan.opportunities || [];

    $('mapped').textContent = num(scan.mappedItems);
    $('liveCount').textContent = num(scan.livePricedItems);
    $('eligible').textContent = num(scan.cofferEligibleItems);
    $('profitable').textContent = num(scan.profitableItems);
    $('source').textContent = scan.officialPriceSource || 'RuneLite bulk snapshot';
    $('rlVersion').textContent = scan.runeliteVersion || '—';
    $('lastScan').textContent = timeAgo(scan.scannedAtEpochSeconds);
    $('status').textContent = `Scanned ${num(scan.mappedItems)} mapped items and found ${num(scan.profitableItems)} profitable coffer opportunities.`;
    $('freshness').textContent = `Market snapshot: ${formatTime(scan.scannedAtEpochSeconds)}`;
    nextRefreshAt = Date.now() + 60000;
    render();
  } catch (e) {
    $('status').textContent = 'Could not load prices.';
    $('errorBox').textContent = e.message;
    $('errorBox').hidden = false;
  } finally {
    $('refresh').disabled = false;
  }
}

function currentRows() {
  const q = $('search').value.trim().toLowerCase();
  const minSaving = Number($('minSaving').value || 0);
  const minVolume = Number($('minVolume').value || 0);
  const minPrice = Number($('minPrice').value || 0);
  const minConfidence = $('confidence').value;
  const membersOnly = $('membersOnly').checked;

  return allRows.filter(x =>
    x.name.toLowerCase().includes(q) &&
    x.savingPercent >= minSaving &&
    x.oneHourTotalVolume >= minVolume &&
    x.liveBuyPrice >= minPrice &&
    (!membersOnly || x.members) &&
    (minConfidence === 'All' || confidenceRank[x.confidence] >= confidenceRank[minConfidence])
  );
}

function render() {
  const filtered = currentRows();
  const rows = [...filtered].sort((a,b) => compare(a,b,sortKey) * sortDir);

  $('count').textContent = num(rows.length);
  $('bestScore').textContent = rows.length ? Math.max(...rows.map(x => x.practicalScore)).toFixed(1) : '—';
  $('bestSaving').textContent = rows.length ? Math.max(...rows.map(x => x.savingPercent)).toFixed(1) + '%' : '—';
  $('emptyState').hidden = rows.length !== 0;

  $('rows').innerHTML = rows.map(x => {
    const recommended = isRecommended(x);
    return `
      <tr>
        <td><div class="item"><img src="${itemIconUrl(x)}" onerror="this.style.display='none'" alt=""><span class="item-meta"><span class="item-name">${escapeHtml(x.name)}</span><span class="item-tag">${recommended ? 'Recommended opportunity' : (x.members ? 'Members' : 'Free-to-play')}</span></span></div></td>
        <td class="score">${x.practicalScore.toFixed(1)}</td>
        <td><span class="badge confidence-${x.confidence.toLowerCase()}">${x.confidence}</span>${recommended ? ' <span class="badge recommended">Pick</span>' : ''}</td>
        <td>${gp(x.liveBuyPrice)}</td>
        <td>${gp(x.liveSellPrice)}</td>
        <td>${gp(x.officialGuidePrice)}</td>
        <td>${gp(x.cofferValue)}</td>
        <td class="good">+${gp(x.savingPerItem)}</td>
        <td class="good">${x.savingPercent.toFixed(2)}%</td>
        <td>${x.valueMultiplier.toFixed(2)}x</td>
        <td>${num(x.oneHourBuyVolume)}</td>
        <td>${num(x.oneHourTotalVolume)}</td>
        <td>${x.buyLimit == null ? '—' : num(x.buyLimit)}</td>
        <td class="good">${x.buyLimit == null ? '—' : '+' + gp(x.potentialSavingPerLimit)}</td>
        <td class="${x.liquidity === 'Very low' || x.liquidity === 'Low' ? 'bad-liq' : ''}">${x.liquidity}</td>
      </tr>`;
  }).join('');

  renderRecommendations(filtered);
  updateSortIndicators();
  saveFilters();
}

function renderRecommendations(filtered) {
  const candidates = filtered
    .filter(x => confidenceRank[x.confidence] >= confidenceRank.Fair && x.oneHourTotalVolume >= 20)
    .sort((a,b) => b.practicalScore - a.practicalScore)
    .slice(0,3);

  if (!candidates.length) {
    $('recommendationCards').innerHTML = '<div class="pick-card"><strong>No realistic picks match these filters yet.</strong><p class="section-note">Try lowering the volume or confidence requirement.</p></div>';
    return;
  }

  $('recommendationCards').innerHTML = candidates.map((x,i) => `
    <article class="pick-card">
      <span class="pick-rank">#${i+1}</span>
      <div class="pick-title">
        <img src="${itemIconUrl(x)}" onerror="this.style.display='none'" alt="">
        <strong>${escapeHtml(x.name)}</strong>
      </div>
      <div class="pick-metrics">
        <div><span>Saving</span><strong class="good">${x.savingPercent.toFixed(1)}%</strong></div>
        <div><span>Save/item</span><strong class="good">+${compactGp(x.savingPerItem)} gp</strong></div>
        <div><span>1h volume</span><strong>${num(x.oneHourTotalVolume)}</strong></div>
      </div>
      <div class="pick-badges">
        <span class="badge confidence-${x.confidence.toLowerCase()}">${x.confidence}</span>
        <span class="badge">Score ${x.practicalScore.toFixed(1)}</span>
        <span class="badge">Limit ${x.buyLimit == null ? '—' : num(x.buyLimit)}</span>
      </div>
    </article>`).join('');
}

function applyPreset(name) {
  activePreset = name;
  document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.preset === name));
  if (name === 'all') {
    $('minSaving').value = 0; $('minVolume').value = 0; $('confidence').value = 'All';
  } else if (name === 'recommended') {
    $('minSaving').value = 2; $('minVolume').value = 50; $('confidence').value = 'Fair';
  } else if (name === 'liquid') {
    $('minSaving').value = 1; $('minVolume').value = 1000; $('confidence').value = 'Good';
  } else if (name === 'bigsave') {
    $('minSaving').value = 5; $('minVolume').value = 0; $('confidence').value = 'All';
  }
  render();
}

function resetFilters() {
  $('search').value = '';
  $('minPrice').value = 0;
  $('membersOnly').checked = false;
  applyPreset('all');
}

function isRecommended(x) {
  return confidenceRank[x.confidence] >= confidenceRank.Fair && x.oneHourTotalVolume >= 50 && x.savingPercent >= 2;
}

function compare(a,b,key){
  if (key === 'confidence') return (confidenceRank[a.confidence] || 0) - (confidenceRank[b.confidence] || 0);
  const av=a[key], bv=b[key];
  if(typeof av==='string') return av.localeCompare(bv);
  return (av ?? -Infinity) - (bv ?? -Infinity);
}

function itemIconUrl(x){
  return 'https://oldschool.runescape.wiki/images/' + encodeURIComponent(String(x.icon || '').replaceAll(' ', '_'));
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function updateSortIndicators(){
  document.querySelectorAll('th[data-key]').forEach(th => {
    th.querySelectorAll('.sort-indicator').forEach(el => el.remove());
    if (th.dataset.key === sortKey) {
      const marker = document.createElement('span');
      marker.className = 'sort-indicator';
      marker.textContent = sortDir === -1 ? '▼' : '▲';
      th.appendChild(marker);
    }
  });
}

function formatTime(epoch){
  if (!epoch) return '—';
  return new Date(epoch * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function timeAgo(epoch){
  if (!epoch) return '—';
  const sec = Math.max(0, Math.round(Date.now()/1000 - epoch));
  if (sec < 10) return 'just now';
  if (sec < 60) return sec + 's ago';
  return Math.floor(sec/60) + 'm ago';
}

function updateCountdown(){
  if (!$('autoRefresh').checked) {
    $('refreshCountdown').textContent = 'Auto refresh paused';
    return;
  }
  const sec = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
  $('refreshCountdown').textContent = `Auto refresh in ${sec}s`;
  if (scan) $('lastScan').textContent = timeAgo(scan.scannedAtEpochSeconds);
}

function startAutoRefresh(){
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = setInterval(() => {
    updateCountdown();
    if ($('autoRefresh').checked && Date.now() >= nextRefreshAt && !$('refresh').disabled) load(false);
  }, 1000);
}

function saveFilters(){
  const data = {
    search:$('search').value,
    minSaving:$('minSaving').value,
    minVolume:$('minVolume').value,
    minPrice:$('minPrice').value,
    confidence:$('confidence').value,
    membersOnly:$('membersOnly').checked,
    autoRefresh:$('autoRefresh').checked,
    activePreset
  };
  localStorage.setItem(savedFiltersKey, JSON.stringify(data));
}

function restoreFilters(){
  try {
    const data = JSON.parse(localStorage.getItem(savedFiltersKey) || '{}');
    if (data.search != null) $('search').value = data.search;
    if (data.minSaving != null) $('minSaving').value = data.minSaving;
    if (data.minVolume != null) $('minVolume').value = data.minVolume;
    if (data.minPrice != null) $('minPrice').value = data.minPrice;
    if (data.confidence) $('confidence').value = data.confidence;
    if (typeof data.membersOnly === 'boolean') $('membersOnly').checked = data.membersOnly;
    if (typeof data.autoRefresh === 'boolean') $('autoRefresh').checked = data.autoRefresh;
    activePreset = data.activePreset || 'all';
    document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.preset === activePreset));
  } catch (_) {}
}

document.querySelectorAll('th[data-key]').forEach(th=>th.addEventListener('click',()=>{
  const key=th.dataset.key;
  if(sortKey===key) sortDir*=-1; else {sortKey=key;sortDir=key==='name'?1:-1;}
  render();
}));
['search','minSaving','minVolume','minPrice','confidence','membersOnly'].forEach(id=>$(id).addEventListener('input',()=>{activePreset='custom';document.querySelectorAll('.filter-chip').forEach(btn=>btn.classList.remove('active'));render();}));
$('autoRefresh').addEventListener('change',()=>{nextRefreshAt = Date.now() + 60000; saveFilters(); updateCountdown();});
$('refresh').addEventListener('click',()=>load(true));
$('resetFilters').addEventListener('click',resetFilters);
document.querySelectorAll('.filter-chip').forEach(btn=>btn.addEventListener('click',()=>applyPreset(btn.dataset.preset)));
$('howItWorks').addEventListener('click',()=>$('infoDialog').showModal());
$('closeDialog').addEventListener('click',()=>$('infoDialog').close());
$('infoDialog').addEventListener('click',e=>{if(e.target===$('infoDialog')) $('infoDialog').close();});

restoreFilters();
startAutoRefresh();
load(false);
