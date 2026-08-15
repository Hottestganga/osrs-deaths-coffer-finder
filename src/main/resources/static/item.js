const $ = id => document.getElementById(id);
const gp = n => n == null ? '—' : Number(n).toLocaleString() + ' gp';
const num = n => n == null ? '—' : Number(n).toLocaleString();
const params = new URLSearchParams(location.search);
const itemId = Number(params.get('id'));

function iconUrl(item){
  return 'https://oldschool.runescape.wiki/images/' + encodeURIComponent(String(item.icon || '').replaceAll(' ', '_'));
}
function fmtTime(epoch){
  if (!epoch) return 'No timestamp';
  return new Date(epoch * 1000).toLocaleString();
}
function age(epoch){
  if (!epoch) return 'unknown age';
  const s = Math.max(0, Math.floor(Date.now()/1000 - epoch));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}
function badgeClass(conf){ return `badge confidence-${String(conf || 'low').toLowerCase()}`; }

async function loadItem(refresh=false){
  $('refreshItem').disabled = true;
  $('itemError').hidden = true;
  try {
    if (!Number.isFinite(itemId) || itemId <= 0) throw new Error('No valid item ID was supplied.');
    const res = await fetch(`/api/item/${itemId}?refresh=${refresh}`, {cache:'no-store'});
    if (res.status === 404) throw new Error('This item is not currently a profitable Death\'s Coffer opportunity, or it is not in the current scan.');
    if (!res.ok) throw new Error(`Could not load item data (HTTP ${res.status}).`);
    const x = await res.json();
    document.title = `${x.name} • Death's Coffer Finder`;
    $('pageTitle').innerHTML = `${escapeHtml(x.name)} <span class="version">V5</span>`;
    $('itemName').textContent = x.name;
    $('membership').textContent = x.members ? 'MEMBERS ITEM' : 'FREE-TO-PLAY ITEM';
    $('itemIcon').src = iconUrl(x);
    $('itemIcon').onerror = () => $('itemIcon').style.display='none';
    $('confidenceBadge').className = badgeClass(x.confidence);
    $('confidenceBadge').textContent = `${x.confidence} confidence`;
    $('liquidityBadge').textContent = `${x.liquidity} liquidity`;
    $('itemSummary').textContent = `Buying near ${gp(x.liveBuyPrice)} would currently produce about ${gp(x.savingPerItem)} of extra coffer value per item.`;

    $('liveBuy').textContent = gp(x.liveBuyPrice);
    $('cofferValue').textContent = gp(x.cofferValue);
    $('savingPerItem').textContent = '+' + gp(x.savingPerItem);
    $('savingPercent').textContent = `${x.savingPercent.toFixed(2)}% saving`;
    $('valueMultiplier').textContent = `${x.valueMultiplier.toFixed(2)}x`;

    $('liveBuy2').textContent = gp(x.liveBuyPrice);
    $('liveSell').textContent = gp(x.liveSellPrice);
    $('officialGe').textContent = gp(x.officialGuidePrice);
    $('cofferValue2').textContent = gp(x.cofferValue);
    const spread = x.liveSellPrice > 0 ? x.liveBuyPrice - x.liveSellPrice : null;
    $('spread').textContent = spread == null ? '—' : gp(spread);

    $('buyVol').textContent = num(x.oneHourBuyVolume);
    $('sellVol').textContent = num(x.oneHourSellVolume);
    $('totalVol').textContent = num(x.oneHourTotalVolume);
    $('buyLimit').textContent = x.buyLimit == null ? 'Unknown' : num(x.buyLimit);
    $('practicalScore').textContent = x.practicalScore.toFixed(1);

    if (x.buyLimit == null) {
      $('limitCost').textContent = '—'; $('limitCoffer').textContent = '—'; $('limitSaving').textContent = '—';
    } else {
      $('limitCost').textContent = gp(x.liveBuyPrice * x.buyLimit);
      $('limitCoffer').textContent = gp(x.cofferValue * x.buyLimit);
      $('limitSaving').textContent = '+' + gp(x.potentialSavingPerLimit);
    }
    $('liveTimestamp').textContent = `${fmtTime(x.liveBuyTimestamp)} (${age(x.liveBuyTimestamp)})`;
    $('officialTimestamp').textContent = `${fmtTime(x.officialPriceTimestamp)} (${age(x.officialPriceTimestamp)})`;
    $('itemId').textContent = x.id;
  } catch (e) {
    $('itemError').textContent = e.message;
    $('itemError').hidden = false;
  } finally {
    $('refreshItem').disabled = false;
  }
}
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
$('refreshItem').addEventListener('click',()=>loadItem(true));
loadItem(false);
