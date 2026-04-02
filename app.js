// Spectrum Finance DEX Tracker
// API: https://api.spectrum.fi/v1/

const SPECTRUM_API = 'https://api.spectrum.fi/v1';
const EXPLORER_API = 'https://api.ergoplatform.com/api/v1';

let allPools = [];
let volumeChart = null;
let autoRefreshTimer = null;

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

function fmtNum(n, decimals = 4) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return parseFloat(n.toFixed(decimals)).toString();
}

function fmtChange(pct) {
  if (pct == null || isNaN(pct)) return '<span class="change-flat">—</span>';
  const sign = pct >= 0 ? '+' : '';
  const cls = pct > 0.5 ? 'change-up' : pct < -0.5 ? 'change-down' : 'change-flat';
  return `<span class="${cls}">${sign}${pct.toFixed(2)}%</span>`;
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function shortTx(tx) {
  return tx ? tx.slice(0, 8) + '…' + tx.slice(-6) : '—';
}

// ─── API Calls ────────────────────────────────────────────────────────────────

async function fetchPools() {
  const res = await fetch(`${SPECTRUM_API}/amm/pools/stats?limit=100&offset=0`);
  if (!res.ok) throw new Error('pools fetch failed');
  return res.json();
}

async function fetchSwaps() {
  const res = await fetch(`${SPECTRUM_API}/amm/swaps?limit=30&offset=0`);
  if (!res.ok) throw new Error('swaps fetch failed');
  return res.json();
}

async function fetchPlatformStats() {
  const res = await fetch(`${SPECTRUM_API}/amm/platform/stats`);
  if (!res.ok) throw new Error('platform stats fetch failed');
  return res.json();
}

// ─── Render Helpers ───────────────────────────────────────────────────────────

function pairLabel(pool) {
  const x = pool.lockedX?.name || pool.x?.name || '?';
  const y = pool.lockedY?.name || pool.y?.name || '?';
  return `${x}/${y}`;
}

function pairEmoji(name) {
  const map = { ERG: '🔮', SigUSD: '💵', SigRSV: '📈', SPF: '⚡', RSN: '🌐', COMET: '☄️', NETA: '🌀' };
  return map[name] || '🪙';
}

// ─── Stat Cards ───────────────────────────────────────────────────────────────

function renderStats(stats, pools) {
  const vol = stats?.volume?.value ?? pools.reduce((s, p) => s + (p.volume?.value || 0), 0);
  const liq = stats?.tvl?.value ?? pools.reduce((s, p) => s + (p.tvl?.value || 0), 0);
  const txCount = stats?.transactions || '—';
  const pairCount = pools.length;

  document.getElementById('statVolume').textContent = fmtUSD(vol);
  document.getElementById('statPairs').textContent = pairCount;
  document.getElementById('statLiquidity').textContent = fmtUSD(liq);
  document.getElementById('statSwaps').textContent = typeof txCount === 'number' ? fmtNum(txCount, 0) : txCount;

  document.getElementById('statVolumeSub').textContent = '24h DEX volume';
  document.getElementById('statPairsSub').textContent = 'active trading pairs';
  document.getElementById('statLiquiditySub').textContent = 'total value locked';
  document.getElementById('statSwapsSub').textContent = '24h transactions';
}

// ─── Pairs Table ──────────────────────────────────────────────────────────────

function renderPairs(pools) {
  const sorted = [...pools].sort((a, b) => (b.volume?.value || 0) - (a.volume?.value || 0)).slice(0, 20);
  document.getElementById('pairCount').textContent = sorted.length;

  const tbody = document.getElementById('pairsBody');
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No pairs data available</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map((pool, i) => {
    const pair = pairLabel(pool);
    const price = pool.lastPrice ?? pool.price ?? null;
    const vol = pool.volume?.value ?? 0;
    const liq = pool.tvl?.value ?? 0;
    const change = pool.priceChange ?? null;

    return `<tr>
      <td class="rank-num">${i + 1}</td>
      <td>
        <div class="pair-name">${pair}</div>
        <div class="pair-sub">${pool.poolId ? shortTx(pool.poolId) : ''}</div>
      </td>
      <td>${price != null ? fmtNum(price, 6) : '—'}</td>
      <td>${fmtUSD(vol)}</td>
      <td>${fmtUSD(liq)}</td>
      <td>${fmtChange(change)}</td>
    </tr>`;
  }).join('');
}

// ─── Volume Chart ─────────────────────────────────────────────────────────────

function renderVolumeChart(pools) {
  const top8 = [...pools]
    .sort((a, b) => (b.volume?.value || 0) - (a.volume?.value || 0))
    .slice(0, 8);

  const labels = top8.map(p => pairLabel(p));
  const data = top8.map(p => p.volume?.value || 0);

  const colors = [
    '#7c3aed', '#a855f7', '#06b6d4', '#3b82f6',
    '#22c55e', '#f59e0b', '#ef4444', '#ec4899'
  ];

  const ctx = document.getElementById('volumeChart').getContext('2d');

  if (volumeChart) volumeChart.destroy();

  volumeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#0a0a12',
        borderWidth: 3,
        hoverBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: { size: 11 },
            padding: 12,
            boxWidth: 14,
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}`
          }
        }
      },
      cutout: '60%',
    }
  });
}

// ─── Swaps Table ──────────────────────────────────────────────────────────────

function renderSwaps(swaps) {
  document.getElementById('swapCount').textContent = swaps.length;
  const tbody = document.getElementById('swapsBody');

  if (!swaps.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No recent swaps found</td></tr>';
    return;
  }

  tbody.innerHTML = swaps.map(swap => {
    const inputToken = swap.inputAmount?.name || swap.input?.name || '?';
    const outputToken = swap.outputAmount?.name || swap.output?.name || '?';
    const inputAmt = swap.inputAmount?.amount ?? swap.input?.amount;
    const outputAmt = swap.outputAmount?.amount ?? swap.output?.amount;
    const isBuy = outputToken === 'ERG' || inputToken !== 'ERG';
    const pair = `${inputToken}/${outputToken}`;
    const usdVal = swap.usdValue ?? null;
    const ts = swap.timestamp ? new Date(swap.timestamp).getTime() : null;
    const txId = swap.id || swap.txId || null;

    return `<tr>
      <td style="color:var(--text-muted)">${ts ? timeAgo(ts) : '—'}</td>
      <td>${pair}</td>
      <td><span class="${isBuy ? 'side-buy' : 'side-sell'}">${isBuy ? 'BUY' : 'SELL'}</span></td>
      <td>${inputAmt != null ? fmtNum(inputAmt) : '—'} <span style="color:var(--text-muted)">${inputToken}</span></td>
      <td>${outputAmt != null ? fmtNum(outputAmt) : '—'} <span style="color:var(--text-muted)">${outputToken}</span></td>
      <td style="color:var(--cyan)">${fmtUSD(usdVal)}</td>
      <td>${txId ? `<a class="tx-link" href="https://explorer.ergoplatform.com/en/transactions/${txId}" target="_blank">${shortTx(txId)}</a>` : '—'}</td>
    </tr>`;
  }).join('');
}

// ─── Pools Grid ───────────────────────────────────────────────────────────────

function renderPools(pools) {
  allPools = pools;
  filterPools();
}

function filterPools() {
  const q = document.getElementById('poolSearch').value.toLowerCase();
  const filtered = q
    ? allPools.filter(p => pairLabel(p).toLowerCase().includes(q))
    : allPools;

  const grid = document.getElementById('poolsGrid');

  if (!filtered.length) {
    grid.innerHTML = '<div class="loading-text">No matching pools</div>';
    return;
  }

  grid.innerHTML = filtered.map(pool => {
    const pair = pairLabel(pool);
    const [a, b] = pair.split('/');
    const liq = pool.tvl?.value ?? 0;
    const vol = pool.volume?.value ?? 0;
    const fee = pool.fee ?? pool.feeNum ?? null;
    const price = pool.lastPrice ?? pool.price;

    return `<div class="pool-card">
      <div class="pool-pair">
        <span class="pool-icons">${pairEmoji(a)}${pairEmoji(b)}</span>
        ${pair}
      </div>
      <div class="pool-stats">
        <div class="pool-stat">
          <span class="pool-stat-label">Liquidity</span>
          <span class="pool-stat-value">${fmtUSD(liq)}</span>
        </div>
        <div class="pool-stat">
          <span class="pool-stat-label">24h Volume</span>
          <span class="pool-stat-value">${fmtUSD(vol)}</span>
        </div>
        ${price != null ? `<div class="pool-stat">
          <span class="pool-stat-label">Price</span>
          <span class="pool-stat-value">${fmtNum(price, 6)}</span>
        </div>` : ''}
      </div>
      ${fee != null ? `<span class="pool-fee">Fee: ${(fee / 10).toFixed(1)}%</span>` : ''}
    </div>`;
  }).join('');
}

// ─── Main Loader ──────────────────────────────────────────────────────────────

async function loadAll() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinning">↻</span> Loading…';

  try {
    const [pools, swaps, stats] = await Promise.allSettled([
      fetchPools(),
      fetchSwaps(),
      fetchPlatformStats(),
    ]);

    const poolData = pools.status === 'fulfilled' ? (Array.isArray(pools.value) ? pools.value : pools.value?.pools ?? pools.value?.items ?? []) : [];
    const swapData = swaps.status === 'fulfilled' ? (Array.isArray(swaps.value) ? swaps.value : swaps.value?.swaps ?? swaps.value?.items ?? []) : [];
    const statsData = stats.status === 'fulfilled' ? stats.value : {};

    renderStats(statsData, poolData);
    renderPairs(poolData);
    renderVolumeChart(poolData);
    renderSwaps(swapData);
    renderPools(poolData);

    document.getElementById('lastUpdate').textContent = 'Updated: ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error('Load error:', err);
    showFallback();
  } finally {
    btn.disabled = false;
    btn.innerHTML = '↻ Refresh';
  }
}

function showFallback() {
  // Show informative placeholder when API is unreachable (CORS or offline)
  document.getElementById('statVolume').textContent = '$2.4M';
  document.getElementById('statPairs').textContent = '47';
  document.getElementById('statLiquidity').textContent = '$8.1M';
  document.getElementById('statSwaps').textContent = '1,284';
  document.getElementById('statVolumeSub').textContent = '24h DEX volume (demo)';
  document.getElementById('statPairsSub').textContent = 'active trading pairs';
  document.getElementById('statLiquiditySub').textContent = 'total value locked';
  document.getElementById('statSwapsSub').textContent = '24h transactions (demo)';

  const demoPools = [
    { pair: 'ERG/SigUSD', liq: 3200000, vol: 890000, price: 1.042, fee: 3 },
    { pair: 'ERG/SigRSV', liq: 1100000, vol: 340000, price: 0.00041, fee: 3 },
    { pair: 'ERG/SPF', liq: 840000, vol: 210000, price: 0.00089, fee: 3 },
    { pair: 'ERG/RSN', liq: 520000, vol: 180000, price: 0.0032, fee: 3 },
    { pair: 'ERG/COMET', liq: 310000, vol: 95000, price: 0.0000071, fee: 3 },
    { pair: 'ERG/NETA', liq: 280000, vol: 77000, price: 0.000088, fee: 3 },
  ];

  document.getElementById('pairCount').textContent = demoPools.length;
  document.getElementById('pairsBody').innerHTML = demoPools.map((p, i) => `
    <tr>
      <td class="rank-num">${i + 1}</td>
      <td><div class="pair-name">${p.pair}</div><div class="pair-sub">demo data</div></td>
      <td>${p.price}</td>
      <td>${fmtUSD(p.vol)}</td>
      <td>${fmtUSD(p.liq)}</td>
      <td>${fmtChange((Math.random() - 0.4) * 10)}</td>
    </tr>`).join('');

  const labels = demoPools.map(p => p.pair);
  const data = demoPools.map(p => p.vol);
  const colors = ['#7c3aed','#a855f7','#06b6d4','#3b82f6','#22c55e','#f59e0b'];
  const ctx = document.getElementById('volumeChart').getContext('2d');
  if (volumeChart) volumeChart.destroy();
  volumeChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#0a0a12', borderWidth: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12, boxWidth: 14 } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtUSD(ctx.parsed)}` } }
      },
      cutout: '60%',
    }
  });

  document.getElementById('swapCount').textContent = '—';
  document.getElementById('swapsBody').innerHTML = '<tr><td colspan="7" class="loading-row" style="color:var(--yellow)">⚠ Live data unavailable — Spectrum API may require proxy for CORS. Demo stats shown above.</td></tr>';

  document.getElementById('poolsGrid').innerHTML = demoPools.map(p => {
    const [a, b] = p.pair.split('/');
    return `<div class="pool-card">
      <div class="pool-pair"><span class="pool-icons">${pairEmoji(a)}${pairEmoji(b)}</span>${p.pair}</div>
      <div class="pool-stats">
        <div class="pool-stat"><span class="pool-stat-label">Liquidity</span><span class="pool-stat-value">${fmtUSD(p.liq)}</span></div>
        <div class="pool-stat"><span class="pool-stat-label">24h Volume</span><span class="pool-stat-value">${fmtUSD(p.vol)}</span></div>
        <div class="pool-stat"><span class="pool-stat-label">Price</span><span class="pool-stat-value">${p.price}</span></div>
      </div>
      <span class="pool-fee">Fee: 0.3%</span>
    </div>`;
  }).join('');

  document.getElementById('lastUpdate').textContent = 'Demo mode — ' + new Date().toLocaleTimeString();
}

// ─── Auto refresh every 60s ───────────────────────────────────────────────────
loadAll();
autoRefreshTimer = setInterval(loadAll, 60000);
