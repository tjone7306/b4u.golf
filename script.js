/* =========================================================
   B4U.GOLF — shared front-end behavior
   ========================================================= */

/* ---- Mobile nav toggle ---- */
document.addEventListener('DOMContentLoaded', () => {
  // Register service worker for PWA install / offline support
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Periodically check for new versions
      setInterval(() => reg.update().catch(()=>{}), 60_000);

      // When a new SW takes over, reload the page so users see the latest code
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });

      // If there's already a waiting SW, activate it now
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available — activate it (will trigger controllerchange + reload above)
            newSW.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch(() => { /* offline mode not critical */ });
  }

  const toggle = document.querySelector('.nav-toggle');
  const links  = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  // Mark active nav link based on current page
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path) a.classList.add('active');
  });

  // Set current year in footer
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // Auto-init weather widget if a target exists
  if (document.getElementById('home-weather')) initHomeWeather();
  if (document.getElementById('wx-detail'))    initWeatherDetail();
  if (document.getElementById('course-finder'))initCourseFinder();

  // Course flyover home page
  if (document.getElementById('flyover')) initFlyover();
});

/* ---- Geolocation helper (returns Promise) ---- */
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}

/* ---- Reverse-geocode to a friendly place name (Open-Meteo, no key) ---- */
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en&format=json`;
    const r = await fetch(url);
    const d = await r.json();
    const p = d.results && d.results[0];
    if (!p) return null;
    return [p.name, p.admin1].filter(Boolean).join(', ');
  } catch { return null; }
}

/* ---- Open-Meteo current + daily + hourly forecast (no key required) ---- */
async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,weather_code,uv_index',
    hourly: 'temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,weather_code,uv_index',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: 2
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!r.ok) throw new Error('Weather fetch failed');
  return r.json();
}

/* ---- "Best time to play today" — hour-by-hour playability analysis ---- */
function hourPlayability(temp, wind, gust, precipPct, uv, code) {
  // Lightning / severe storm = unplayable
  if ([95,96,99].includes(code)) return { score: 0, reason: 'thunderstorm' };
  if ([65,73,75,82].includes(code)) return { score: 5, reason: 'heavy precip' };

  let score = 100;
  const issues = [];

  // Wind (worst single factor for golf)
  if (gust >= 30) { score -= 50; issues.push(`gusts ${Math.round(gust)} mph`); }
  else if (wind >= 22) { score -= 30; issues.push(`${Math.round(wind)} mph wind`); }
  else if (wind >= 15) { score -= 15; issues.push(`${Math.round(wind)} mph wind`); }
  else if (wind >= 10) { score -= 5; }

  // Rain probability
  if (precipPct >= 70) { score -= 35; issues.push(`${precipPct}% rain`); }
  else if (precipPct >= 40) { score -= 15; issues.push(`${precipPct}% rain`); }
  else if (precipPct >= 20) { score -= 5; }

  // Temperature comfort
  if (temp < 38) { score -= 25; issues.push('freezing'); }
  else if (temp < 50) { score -= 10; issues.push('cold'); }
  else if (temp > 95) { score -= 25; issues.push('extreme heat'); }
  else if (temp > 88) { score -= 10; issues.push('hot'); }

  // UV burn risk
  if (uv >= 10) { score -= 8; issues.push('extreme UV'); }
  else if (uv >= 8) { score -= 4; }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

function findBestPlayWindows(data) {
  if (!data.hourly || !data.daily) return [];
  const hours = data.hourly.time;
  const now = new Date();
  const sunrise = new Date(data.daily.sunrise[0]);
  const sunset  = new Date(data.daily.sunset[0]);

  // Earliest tee: 30 min after sunrise. Latest 18-hole tee: 4.5 hrs before sunset. Latest 9-hole tee: 2.25 hrs before sunset.
  const earliest = new Date(sunrise.getTime() + 30 * 60_000);
  const latest18 = new Date(sunset.getTime() - 4.5 * 3600_000);
  const latest9  = new Date(sunset.getTime() - 2.25 * 3600_000);
  const cutoff   = latest9; // anything before this still leaves time for at least 9 holes

  // Score each hour from now (rounded down to top of hour) through cutoff
  const playable = [];
  for (let i = 0; i < hours.length; i++) {
    const t = new Date(hours[i]);
    if (t < now && t.getHours() !== now.getHours()) continue;  // skip past hours (keep current hour)
    if (t < earliest) continue;
    if (t > cutoff) break;
    const p = hourPlayability(
      data.hourly.temperature_2m[i],
      data.hourly.wind_speed_10m[i],
      data.hourly.wind_gusts_10m[i] || 0,
      data.hourly.precipitation_probability[i] || 0,
      data.hourly.uv_index[i] || 0,
      data.hourly.weather_code[i]
    );
    playable.push({ time: t, idx: i, ...p, holes18: t <= latest18 });
  }

  if (!playable.length) return [];

  // Find contiguous runs where score >= 70 (workable). Return top 2 runs by avg score.
  const runs = [];
  let cur = null;
  for (const h of playable) {
    if (h.score >= 70) {
      if (!cur) cur = { start: h.time, end: h.time, hours: [h], holes18: h.holes18 };
      else { cur.end = h.time; cur.hours.push(h); cur.holes18 = cur.holes18 && h.holes18; }
    } else {
      if (cur) { runs.push(cur); cur = null; }
    }
  }
  if (cur) runs.push(cur);

  // Tag each run with avg score + a summary
  runs.forEach(r => {
    r.avgScore = Math.round(r.hours.reduce((a,h) => a + h.score, 0) / r.hours.length);
    const allIssues = new Set();
    r.hours.forEach(h => (h.issues || []).forEach(i => allIssues.add(i)));
    r.issues = [...allIssues];
    r.peakScore = Math.max(...r.hours.map(h => h.score));
  });

  // Sort by length × avg score (longer high-score windows preferred)
  return runs
    .sort((a,b) => (b.hours.length * b.avgScore) - (a.hours.length * a.avgScore))
    .slice(0, 2);
}

function fmtHour(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
}

const WX_CODES = {
  0:  ['Clear', '☀️'],
  1:  ['Mostly clear', '🌤️'],
  2:  ['Partly cloudy', '⛅'],
  3:  ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '❄️'],
  75: ['Heavy snow', '❄️'],
  80: ['Showers', '🌦️'],
  81: ['Heavy showers', '🌧️'],
  82: ['Violent showers', '⛈️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['T-storm w/ hail', '⛈️'],
  99: ['Severe T-storm', '⛈️']
};
function wxLabel(code) { return WX_CODES[code] || ['—', '🌤️']; }

function dayName(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function compass(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

/* ---- Home page weather widget ---- */
async function initHomeWeather() {
  const box = document.getElementById('home-weather');
  box.innerHTML = `<p class="muted">📍 Getting your location for live conditions…</p>`;
  try {
    const { lat, lon } = await getLocation();
    const place = await reverseGeocode(lat, lon);
    const data  = await fetchForecast(lat, lon);
    renderHomeWeather(box, data, place);
  } catch (e) {
    box.innerHTML = `
      <p class="muted">Couldn't grab your location automatically.</p>
      <p class="muted" style="font-size:0.9rem">Tip: allow location access, or visit the
        <a href="weather.html">Weather &amp; Conditions</a> page to look up a city.</p>`;
  }
}

function renderHomeWeather(box, data, place) {
  const c = data.current; const d = data.daily;
  const [label, icon] = wxLabel(c.weather_code);
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
      <div>
        <div class="tag">Right now</div>
        <h3 style="margin:0.4rem 0 0.1rem">${place || 'Your location'}</h3>
        <div class="muted" style="font-size:0.9rem">${label}</div>
      </div>
      <div style="font-size:3rem;line-height:1">${icon}</div>
    </div>
    <div class="wx-row">
      <div class="wx-stat"><div class="label">Temp</div><div class="value">${Math.round(c.temperature_2m)}<span class="unit">°F</span></div></div>
      <div class="wx-stat"><div class="label">Wind</div><div class="value">${Math.round(c.wind_speed_10m)}<span class="unit">mph ${compass(c.wind_direction_10m)}</span></div></div>
      <div class="wx-stat"><div class="label">UV</div><div class="value">${Math.round(c.uv_index || 0)}</div></div>
    </div>
    <div class="muted" style="font-size:0.85rem">
      🌅 Sunrise ${fmtTime(d.sunrise[0])} &nbsp;·&nbsp; 🌇 Sunset ${fmtTime(d.sunset[0])}
    </div>
    <div style="margin-top:1rem"><a href="weather.html" class="btn btn-secondary">Full forecast →</a></div>
  `;
}

/* ---- Full weather page ---- */
async function initWeatherDetail() {
  const box = document.getElementById('wx-detail');
  const search = document.getElementById('wx-search');
  const input  = document.getElementById('wx-place');
  const details = document.getElementById('wx-search-details');

  async function load(lat, lon, place) {
    box.innerHTML = `<p class="muted">Loading forecast for ${place}…</p>`;
    try {
      const data = await fetchForecast(lat, lon);
      renderWeatherDetail(box, data, place);
    } catch (e) {
      box.innerHTML = `<p class="muted">Could not load weather. Try again in a moment.</p>`;
    }
  }

  // Auto-load via geolocation
  try {
    const { lat, lon } = await getLocation();
    const place = await reverseGeocode(lat, lon);
    load(lat, lon, place || 'your location');
  } catch {
    // Geolocation denied or failed → auto-expand the manual search form
    box.innerHTML = `<div class="callout warn">📍 Location access was denied or unavailable. Enter a city or ZIP code below to look up a forecast.</div>`;
    if (details) details.open = true;
  }

  if (search && input) {
    search.addEventListener('submit', async ev => {
      ev.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      box.innerHTML = `<p class="muted">Looking up “${q}”…</p>`;
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
        const r = await fetch(url); const j = await r.json();
        const p = j.results && j.results[0];
        if (!p) { box.innerHTML = `<p class="muted">Couldn't find “${q}”.</p>`; return; }
        load(p.latitude, p.longitude, [p.name, p.admin1].filter(Boolean).join(', '));
      } catch {
        box.innerHTML = `<p class="muted">Search failed. Try again.</p>`;
      }
    });
  }
}

function renderWeatherDetail(box, data, place) {
  const c = data.current; const d = data.daily;
  const [label, icon] = wxLabel(c.weather_code);

  // Golf-specific guidance
  let advice = [];
  if (c.wind_speed_10m >= 20) advice.push('🌬️ <strong>Strong wind</strong> — club up downwind, take an extra club into the wind, and play knock-down shots.');
  else if (c.wind_speed_10m >= 12) advice.push('🌬️ <strong>Breezy</strong> — wind will affect ball flight, especially on irons over 150 yards.');
  if ((c.uv_index || 0) >= 7) advice.push('☀️ <strong>High UV</strong> — sunscreen SPF 30+, hat, and UV sunglasses are a must.');
  if (c.temperature_2m <= 50) advice.push('🧤 <strong>Chilly</strong> — ball flies shorter; wear layers and consider a hand warmer.');
  if (c.temperature_2m >= 88) advice.push('🥵 <strong>Hot</strong> — drink ~6–8 oz water every 2–3 holes; consider cooling towel.');
  if (d.precipitation_probability_max[0] >= 50) advice.push('☔ <strong>Rain likely</strong> — pack rain gloves, towel, and waterproof jacket.');
  if ([95,96,99].includes(c.weather_code)) advice.push('⚡ <strong>Thunderstorm risk</strong> — if you hear thunder, get off the course immediately.');

  box.innerHTML = `
    <div class="card" style="margin-bottom:1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">
        <div>
          <div class="tag">Now in</div>
          <h2 style="margin:0.25rem 0">${place}</h2>
          <div class="muted">${label} · feels like ${Math.round(c.apparent_temperature)}°F</div>
        </div>
        <div style="font-size:4rem;line-height:1">${icon}</div>
      </div>
      <div class="wx-row" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr));margin-top:1rem">
        <div class="wx-stat"><div class="label">Temp</div><div class="value">${Math.round(c.temperature_2m)}<span class="unit">°F</span></div></div>
        <div class="wx-stat"><div class="label">Wind</div><div class="value">${Math.round(c.wind_speed_10m)}<span class="unit">mph</span></div><div class="muted" style="font-size:0.75rem">${compass(c.wind_direction_10m)} · gust ${Math.round(c.wind_gusts_10m||0)}</div></div>
        <div class="wx-stat"><div class="label">Humidity</div><div class="value">${Math.round(c.relative_humidity_2m)}<span class="unit">%</span></div></div>
        <div class="wx-stat"><div class="label">UV Index</div><div class="value">${Math.round(c.uv_index||0)}</div></div>
        <div class="wx-stat"><div class="label">Sunrise</div><div class="value" style="font-size:1.05rem">${fmtTime(d.sunrise[0])}</div></div>
        <div class="wx-stat"><div class="label">Sunset</div><div class="value" style="font-size:1.05rem">${fmtTime(d.sunset[0])}</div></div>
      </div>
      ${advice.length ? `<div class="callout info" style="margin-top:1rem"><strong>On-course tips:</strong><ul style="margin:0.5rem 0 0;padding-left:1.2rem">${advice.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
    </div>

    <div class="card">
      <h3 style="margin-bottom:0.5rem">5-day outlook</h3>
      ${d.time.map((t, i) => {
        const [lab, ic] = wxLabel(d.weather_code[i]);
        return `<div class="forecast-day">
          <div class="day-name">${i === 0 ? 'Today' : dayName(t)}</div>
          <div class="day-icon">${ic}</div>
          <div>
            <div>${lab}</div>
            <div class="muted" style="font-size:0.85rem">💧 ${d.precipitation_probability_max[i]||0}% · 🌬️ ${Math.round(d.wind_speed_10m_max[i]||0)} mph · UV ${Math.round(d.uv_index_max[i]||0)}</div>
          </div>
          <div class="temps">${Math.round(d.temperature_2m_max[i])}° <span class="lo">/ ${Math.round(d.temperature_2m_min[i])}°</span></div>
        </div>`;
      }).join('')}
    </div>
  `;
}

/* ---- Course finder (geolocation → Google Maps + GolfNow links) ---- */
async function initCourseFinder() {
  const box = document.getElementById('course-finder');
  const placeBox = document.getElementById('cf-place');
  const form = document.getElementById('cf-form');
  const input = document.getElementById('cf-input');
  const details = document.getElementById('cf-search-details');

  function render(lat, lon, label) {
    if (placeBox) placeBox.textContent = label || '';
    const mapsNear = `https://www.google.com/maps/search/golf+courses/@${lat},${lon},12z`;
    const mapsPublic = `https://www.google.com/maps/search/public+golf+courses/@${lat},${lon},12z`;
    const mapsDriving = `https://www.google.com/maps/search/driving+ranges/@${lat},${lon},12z`;

    box.innerHTML = `
      <div class="card">
        <div class="icon">📍</div>
        <h3>Browse courses near you on a map</h3>
        <p>Interactive Google Maps showing every golf facility around your current location.</p>
        <div class="course-actions" style="margin-top:0.5rem">
          <a href="${mapsNear}" target="_blank" rel="noopener">All courses</a>
          <a href="${mapsPublic}" target="_blank" rel="noopener">Public only</a>
          <a href="${mapsDriving}" target="_blank" rel="noopener">Driving ranges</a>
        </div>
      </div>

      <h3 style="margin-top:2rem">Courses within ~25 miles of you</h3>
      <p class="muted" style="font-size:0.9rem">Click <strong>"Tee times"</strong> on any course below to search booking sites for that <em>specific</em> course — no more landing on the wrong city's results.</p>
      <div class="course-list" id="cf-list"><p class="muted">Loading nearby courses…</p></div>
    `;

    fetchNearbyCourses(lat, lon);
  }

  try {
    const { lat, lon } = await getLocation();
    const place = await reverseGeocode(lat, lon);
    render(lat, lon, place ? `Showing results near ${place}` : '');
  } catch {
    box.innerHTML = `<div class="callout warn">📍 Location access was denied or unavailable. Enter a city or ZIP code below to find courses.</div>`;
    if (details) details.open = true;
  }

  if (form && input) {
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const q = input.value.trim(); if (!q) return;
      box.innerHTML = `<p class="muted">Looking up “${q}”…</p>`;
      try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
        const j = await r.json();
        const p = j.results && j.results[0];
        if (!p) { box.innerHTML = `<p class="muted">Couldn't find “${q}”.</p>`; return; }
        render(p.latitude, p.longitude, `Showing results near ${[p.name,p.admin1].filter(Boolean).join(', ')}`);
      } catch { box.innerHTML = `<p class="muted">Search failed. Try again.</p>`; }
    });
  }
}

/* ---- Pull nearby courses from OpenStreetMap (Overpass API, no key) ---- */
async function fetchNearbyCourses(lat, lon) {
  const list = document.getElementById('cf-list');
  if (!list) return;
  const query = `[out:json][timeout:20];
    (node["leisure"="golf_course"](around:40000,${lat},${lon});
     way["leisure"="golf_course"](around:40000,${lat},${lon});
     relation["leisure"="golf_course"](around:40000,${lat},${lon}););
    out center 30;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    const j = await r.json();
    if (!j.elements || !j.elements.length) {
      list.innerHTML = `<p class="muted">No courses found in OpenStreetMap data within 25 miles. Try the Google Maps links above for the most complete list.</p>`;
      return;
    }
    const items = j.elements
      .map(el => {
        const t = el.tags || {};
        const cLat = el.lat || (el.center && el.center.lat);
        const cLon = el.lon || (el.center && el.center.lon);
        if (!cLat || !cLon || !t.name) return null;
        const dist = haversine(lat, lon, cLat, cLon);
        return { name: t.name, lat: cLat, lon: cLon, dist, tags: t };
      })
      .filter(Boolean)
      .sort((a,b) => a.dist - b.dist)
      .slice(0, 15);

    if (!items.length) {
      list.innerHTML = `<p class="muted">No named courses returned. Try the Google Maps links above.</p>`;
      return;
    }

    list.innerHTML = items.map(c => {
      const maps    = `https://www.google.com/maps/search/${encodeURIComponent(c.name)}/@${c.lat},${c.lon},15z`;
      const drive   = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}`;
      // GolfNow's searchTerm= is a real deep-link to their booking page, filtered to this course
      const teeGolfNow = `https://www.golfnow.com/tee-times/search?searchTerm=${encodeURIComponent(c.name)}`;
      const website = `https://www.google.com/search?q=${encodeURIComponent(c.name + ' golf course official website')}`;
      const par    = c.tags.par ? ` · Par ${c.tags.par}` : '';
      const access = c.tags.access ? ` · ${c.tags.access[0].toUpperCase()+c.tags.access.slice(1)}` : '';
      return `<div class="course-item">
        <div>
          <h3>${c.name}</h3>
          <div class="meta">${c.dist.toFixed(1)} mi away${par}${access}</div>
        </div>
        <div class="course-actions">
          <a href="${teeGolfNow}" target="_blank" rel="noopener" title="Open this course's GolfNow booking page">🕐 Tee times</a>
          <a href="${maps}" target="_blank" rel="noopener">📍 Map</a>
          <a href="${drive}" target="_blank" rel="noopener">🚗 Directions</a>
          <a href="${website}" target="_blank" rel="noopener" title="Find course website">🌐 Website</a>
        </div>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = `<p class="muted">Live course list is unavailable right now. Use the Google Maps and GolfNow links above.</p>`;
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // miles
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* =========================================================================
   COURSE FLYOVER HOME PAGE — "play the hole" experience
   - Computes Round Readiness Score from live weather
   - Animates ball traveling down the fairway as you scroll
   - Updates yardage track on the right edge
   ========================================================================= */

async function initFlyover() {
  // Ball-follows-scroll
  const ball = document.getElementById('flyover-ball');
  const flyover = document.getElementById('flyover');
  if (ball && flyover) {
    const ticker = () => {
      const rect = flyover.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const passed = Math.min(Math.max(-rect.top, 0), total);
      const pct = total > 0 ? passed / total : 0;
      // Ball travels from y=0 to y=flyover height
      ball.style.transform = `translate(-50%, ${rect.height * pct - 9}px)`;
      // Highlight the active yardage tick
      const ticks = document.querySelectorAll('.yardage-tick');
      const activeIdx = Math.min(ticks.length - 1, Math.floor(pct * ticks.length + 0.05));
      ticks.forEach((t, i) => t.classList.toggle('active', i === activeIdx));
    };
    window.addEventListener('scroll', ticker, { passive: true });
    window.addEventListener('resize', ticker);
    ticker();
  }

  // Yardage track click-to-jump
  document.querySelectorAll('.yardage-tick').forEach(tick => {
    tick.addEventListener('click', () => {
      const target = document.querySelector(tick.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Pull weather → compute Readiness Score; pull nearby courses too
  try {
    const { lat, lon } = await getLocation();
    const place = await reverseGeocode(lat, lon);
    const data  = await fetchForecast(lat, lon);
    renderBestTimeToPlay(data, place);
    renderReadiness(data, place);
    renderFairwayTiles(data);
    renderHomeForecast(data);
    renderHomeCourses(lat, lon, place);
  } catch (e) {
    renderReadinessOffline();
    const bt = document.getElementById('best-time');
    if (bt) bt.innerHTML = `<p class="muted" style="color:rgba(255,255,255,0.85)">📍 Allow location access for tee-time recommendations.</p>`;
    const courseList = document.getElementById('home-courses-list');
    if (courseList) {
      courseList.innerHTML = `<div class="callout warn" style="color:var(--green-900);background:rgba(255,255,255,0.92)">📍 Allow location access to see courses near you. <a href="courses.html" style="color:var(--green-700);font-weight:700">Or search a city manually →</a></div>`;
    }
    const fcRows = document.getElementById('fairway-forecast-rows');
    if (fcRows) fcRows.innerHTML = `<p class="muted" style="font-size:0.9rem">Allow location access to see forecast.</p>`;
  }
}

/* ---- Render the "Best time to play today" widget ---- */
function renderBestTimeToPlay(data, place) {
  const box = document.getElementById('best-time');
  if (!box) return;

  const windows = findBestPlayWindows(data);
  const sunset = new Date(data.daily.sunset[0]);
  const now = new Date();
  const minutesLeft = (sunset - now) / 60_000;

  if (!windows.length) {
    // No "good" windows today
    if (minutesLeft < 60) {
      box.innerHTML = `
        <div class="bt-headline">⏰ <strong>Out of daylight today</strong></div>
        <div class="bt-sub">Sun sets at ${fmtHour(sunset)}. Check tomorrow's forecast on the <a href="weather.html">weather page</a>.</div>`;
    } else {
      box.innerHTML = `
        <div class="bt-headline">⚠️ <strong>Tough day to score</strong></div>
        <div class="bt-sub">No high-quality playing windows in today's forecast. The whole day's conditions are below par for golf — wind, rain, or extreme temps. <a href="weather.html">See the full breakdown →</a></div>`;
    }
    return;
  }

  // Render windows as cards
  const cards = windows.map((w, i) => {
    const startStr = fmtHour(w.start);
    const endStr   = fmtHour(new Date(w.end.getTime() + 60 * 60_000)); // window includes its end hour
    const len = w.hours.length;
    const lengthLabel = len === 1 ? '1 hour' : `${len} hours`;
    const holesLabel = w.holes18 ? '18 holes' : '9 holes only';
    const issuesLabel = w.issues.length ? `<span class="bt-issues">⚠ ${w.issues.join(', ')}</span>` : '<span class="bt-clean">✓ all conditions clear</span>';
    const scoreColor = w.avgScore >= 90 ? 'var(--green-300)' : w.avgScore >= 80 ? '#a8d99c' : 'var(--sun)';
    return `
      <div class="bt-card" style="border-left-color:${scoreColor}">
        <div class="bt-card-top">
          <div>
            <div class="bt-window">${i === 0 ? '🏌️ Best window' : '⛳ Also good'}</div>
            <div class="bt-time">${startStr} – ${endStr}</div>
          </div>
          <div class="bt-score" style="color:${scoreColor}">${w.avgScore}</div>
        </div>
        <div class="bt-meta">${lengthLabel} · ${holesLabel} · ${issuesLabel}</div>
      </div>`;
  }).join('');

  box.innerHTML = `
    <div class="bt-head">
      <div>
        <div class="bt-eyebrow">Best time to play today</div>
        <div class="bt-place">${place || 'your area'}</div>
      </div>
      <div class="bt-sunset">🌇 sunset ${fmtHour(sunset)}</div>
    </div>
    <div class="bt-cards">${cards}</div>
  `;
}

/* ---- Home page: 5-day forecast strip ---- */
function renderHomeForecast(data) {
  const wrap = document.getElementById('fairway-forecast-rows');
  if (!wrap) return;
  const d = data.daily;
  wrap.innerHTML = d.time.slice(0, 5).map((t, i) => {
    const [lab, ic] = wxLabel(d.weather_code[i]);
    return `
      <div style="display:grid;grid-template-columns:60px auto 1fr auto;gap:0.75rem;align-items:center;padding:0.55rem 0;border-bottom:1px solid var(--gray-100);font-size:0.92rem">
        <span style="font-weight:700;color:var(--green-900)">${i === 0 ? 'Today' : dayName(t)}</span>
        <span style="font-size:1.4rem;line-height:1">${ic}</span>
        <span class="muted">${lab} · 💧 ${d.precipitation_probability_max[i]||0}% · 🌬 ${Math.round(d.wind_speed_10m_max[i]||0)} mph</span>
        <span style="font-weight:600;color:var(--green-900)">${Math.round(d.temperature_2m_max[i])}° / <span class="muted">${Math.round(d.temperature_2m_min[i])}°</span></span>
      </div>`;
  }).join('');
}

/* ---- Home page: live nearby courses (top 5) ---- */
async function renderHomeCourses(lat, lon, place) {
  const placeBox = document.getElementById('home-courses-place');
  const list = document.getElementById('home-courses-list');
  if (!list) return;

  if (placeBox && place) {
    placeBox.innerHTML = `📍 <strong>Showing courses near ${place}</strong> — closest five within 25 miles.`;
  }

  const query = `[out:json][timeout:20];
    (node["leisure"="golf_course"](around:40000,${lat},${lon});
     way["leisure"="golf_course"](around:40000,${lat},${lon});
     relation["leisure"="golf_course"](around:40000,${lat},${lon}););
    out center 30;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    const j = await r.json();
    if (!j.elements || !j.elements.length) {
      list.innerHTML = `<div class="callout warn" style="color:var(--green-900);background:rgba(255,255,255,0.92)">No courses found in OpenStreetMap data within 25 miles. <a href="courses.html" style="color:var(--green-700);font-weight:700">Search Google Maps for golf courses →</a></div>`;
      return;
    }
    const items = j.elements
      .map(el => {
        const t = el.tags || {};
        const cLat = el.lat || (el.center && el.center.lat);
        const cLon = el.lon || (el.center && el.center.lon);
        if (!cLat || !cLon || !t.name) return null;
        const dist = haversine(lat, lon, cLat, cLon);
        return { name: t.name, lat: cLat, lon: cLon, dist, tags: t };
      })
      .filter(Boolean)
      .sort((a,b) => a.dist - b.dist)
      .slice(0, 5);

    if (!items.length) {
      list.innerHTML = `<p class="muted" style="color:rgba(255,255,255,0.7)">No named courses near you in OpenStreetMap. <a href="courses.html" style="color:white;font-weight:700">View map of nearby golf →</a></p>`;
      return;
    }

    list.innerHTML = items.map(c => {
      const teeGolfNow = `https://www.golfnow.com/tee-times/search?searchTerm=${encodeURIComponent(c.name)}`;
      const maps    = `https://www.google.com/maps/search/${encodeURIComponent(c.name)}/@${c.lat},${c.lon},15z`;
      const drive   = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}`;
      return `<div style="background:rgba(255,255,255,0.95);border-radius:14px;padding:1rem 1.1rem;margin-bottom:0.6rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem 1rem">
        <div>
          <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:800;color:var(--green-900);margin-bottom:0.1rem">${c.name}</div>
          <div style="font-size:0.85rem;color:var(--gray-500)">${c.dist.toFixed(1)} mi · ${(c.tags.access || 'public').replace(/^./, x => x.toUpperCase())}</div>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <a href="${teeGolfNow}" target="_blank" rel="noopener" style="background:var(--green-700);color:white;padding:0.4rem 0.8rem;border-radius:999px;font-size:0.82rem;font-weight:600;text-decoration:none">🕐 Tee times</a>
          <a href="${maps}" target="_blank" rel="noopener" style="background:var(--green-50);color:var(--green-700);padding:0.4rem 0.8rem;border-radius:999px;font-size:0.82rem;font-weight:600;text-decoration:none">📍 Map</a>
          <a href="${drive}" target="_blank" rel="noopener" style="background:var(--green-50);color:var(--green-700);padding:0.4rem 0.8rem;border-radius:999px;font-size:0.82rem;font-weight:600;text-decoration:none">🚗 Go</a>
        </div>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = `<p class="muted" style="color:rgba(255,255,255,0.7)">Live course list unavailable. <a href="courses.html" style="color:white;font-weight:700">Use the full course finder →</a></p>`;
  }
}

/* ---- ROUND READINESS SCORE ----
   0–100. Combines four factors out of 25 each:
     - Weather quality (wind, precip, lightning)
     - Comfort (temperature)
     - Daylight (will you finish before dark)
     - Conditions (UV / humidity proxy + dew/frost risk) */

function computeReadiness(data) {
  const c = data.current;
  const d = data.daily;
  let weather = 25, comfort = 25, daylight = 25, conditions = 25;
  const notes = [];

  // ---- Weather (wind, precipitation, storms) ----
  if ([95,96,99].includes(c.weather_code)) { weather -= 25; notes.push('⚡ thunderstorm risk'); }
  else if (c.weather_code === 82) { weather -= 18; notes.push('violent rain showers'); }
  else if ([65,73,75].includes(c.weather_code)) { weather -= 14; notes.push('heavy precipitation'); }
  else if ([61,63,80,81,53,55].includes(c.weather_code)) { weather -= 8; notes.push('rain'); }
  else if ([45,48,51].includes(c.weather_code)) { weather -= 4; notes.push('light precip / fog'); }
  // Wind
  if (c.wind_speed_10m >= 25) { weather -= 12; notes.push(`${Math.round(c.wind_speed_10m)} mph wind`); }
  else if (c.wind_speed_10m >= 18) { weather -= 7; notes.push(`${Math.round(c.wind_speed_10m)} mph wind`); }
  else if (c.wind_speed_10m >= 12) { weather -= 3; }
  // Precipitation probability for the day
  if (d.precipitation_probability_max[0] >= 70) { weather -= 6; notes.push('rain likely today'); }
  else if (d.precipitation_probability_max[0] >= 40) { weather -= 3; }
  weather = Math.max(0, weather);

  // ---- Comfort (temperature) ----
  const t = c.temperature_2m;
  if (t < 32) { comfort -= 22; notes.push('freezing'); }
  else if (t < 45) { comfort -= 12; notes.push('cold'); }
  else if (t < 55) { comfort -= 5; }
  else if (t > 95) { comfort -= 16; notes.push('extreme heat'); }
  else if (t > 88) { comfort -= 8; notes.push('hot'); }
  else if (t >= 60 && t <= 80) { /* sweet spot, no penalty */ }
  comfort = Math.max(0, comfort);

  // ---- Daylight (can you start a round and finish before sunset?) ----
  const now = new Date();
  const sunset = new Date(d.sunset[0]);
  const minutesLeft = (sunset - now) / 60000;
  if (minutesLeft >= 270) { /* full 18 + buffer */ }
  else if (minutesLeft >= 200) { daylight -= 4; }
  else if (minutesLeft >= 135) { daylight -= 12; notes.push('only 9 holes today'); }
  else if (minutesLeft >= 60)  { daylight -= 18; notes.push('twilight only'); }
  else { daylight -= 25; notes.push('not enough daylight'); }
  daylight = Math.max(0, daylight);

  // ---- Conditions (UV, frost risk, dew) ----
  const uv = c.uv_index || 0;
  if (uv >= 9) { conditions -= 5; notes.push('extreme UV'); }
  else if (uv >= 7) { conditions -= 2; }
  // Frost risk: low temp near freezing during morning
  const dailyMin = d.temperature_2m_min[0];
  if (dailyMin <= 33) { conditions -= 6; notes.push('frost delay risk'); }
  else if (dailyMin <= 38) { conditions -= 3; notes.push('heavy dew expected'); }
  // Humidity heavy
  if (c.relative_humidity_2m >= 85) { conditions -= 3; }
  conditions = Math.max(0, conditions);

  const total = Math.round(weather + comfort + daylight + conditions);
  return { total, weather: Math.round(weather), comfort: Math.round(comfort), daylight: Math.round(daylight), conditions: Math.round(conditions), notes };
}

function readinessVerdict(score) {
  if (score >= 85) return { tone: '#6cbb74', emoji: '🟢', label: 'Send it.', text: 'Conditions are excellent. Go play your round.' };
  if (score >= 70) return { tone: '#a8d99c', emoji: '🟢', label: 'Solid day for golf.', text: 'A few things to manage, but conditions are good.' };
  if (score >= 55) return { tone: '#f5b941', emoji: '🟡', label: 'Workable.', text: 'Manage what the day throws at you and you\'ll be fine.' };
  if (score >= 35) return { tone: '#ee7752', emoji: '🟠', label: 'Tough day to score.', text: 'Conditions will fight you. Consider reshuffling, or adjust expectations.' };
  return { tone: '#d63d3d', emoji: '🔴', label: 'Probably reschedule.', text: 'The day is stacked against you. Move it if you can.' };
}

function renderReadiness(data, place) {
  const r = computeReadiness(data);
  const v = readinessVerdict(r.total);
  const ring = document.getElementById('score-ring');
  if (!ring) return;

  // Animate ring fill
  const circumference = 2 * Math.PI * 80; // r=80
  const fillEl = ring.querySelector('.fill');
  fillEl.style.stroke = v.tone;
  fillEl.style.strokeDasharray = `${(r.total/100) * circumference} ${circumference}`;

  document.getElementById('score-num').textContent = r.total;
  document.getElementById('score-place').textContent = place || 'your area';

  // Sub-scores
  const rows = [
    ['Weather',    r.weather,    25],
    ['Comfort',    r.comfort,    25],
    ['Daylight',   r.daylight,   25],
    ['Conditions', r.conditions, 25]
  ];
  document.getElementById('score-rows').innerHTML = rows.map(([label, val, max]) => `
    <div class="score-row">
      <span class="row-label">${label}</span>
      <span class="bar"><span style="transform:scaleX(${val/max})"></span></span>
      <span class="pts">${val}/${max}</span>
    </div>
  `).join('');

  // Verdict line
  document.getElementById('score-verdict').innerHTML = `
    <span class="verdict-emoji">${v.emoji}</span>
    <span><strong style="color:white">${v.label}</strong> ${v.text}</span>
  `;
}

function renderReadinessOffline() {
  const ring = document.getElementById('score-ring');
  if (!ring) return;
  document.getElementById('score-num').textContent = '—';
  document.getElementById('score-place').textContent = 'your area';
  document.getElementById('score-rows').innerHTML = `
    <p style="color:rgba(255,255,255,0.75);font-size:0.9rem">📍 Allow location access to compute your live Round Readiness Score from real weather data — wind, precipitation, daylight, and course-condition risk all rolled up into one number.</p>`;
  document.getElementById('score-verdict').innerHTML = '';
}

/* ---- Fairway tiles (weather mini-grid below score) ---- */
function renderFairwayTiles(data) {
  const wrap = document.getElementById('fairway-tiles');
  if (!wrap) return;
  const c = data.current;
  const d = data.daily;
  const [label, icon] = wxLabel(c.weather_code);
  const tempNote = c.temperature_2m < 50 ? 'ball flies short' : c.temperature_2m > 85 ? 'ball flies long' : 'normal yardages';
  const windNote = c.wind_speed_10m >= 18 ? 'club up into wind' : c.wind_speed_10m >= 10 ? 'wind affects iron play' : 'minimal wind effect';
  const uvNote = (c.uv_index||0) >= 7 ? 'sunscreen + hat critical' : (c.uv_index||0) >= 4 ? 'sunscreen recommended' : 'low UV';
  const rainNote = d.precipitation_probability_max[0] >= 50 ? 'pack rain gear' : d.precipitation_probability_max[0] >= 25 ? 'small chance of rain' : 'dry round expected';

  wrap.innerHTML = `
    <div class="weather-tile">
      <div class="t-label">Right now · ${icon}</div>
      <div class="t-value">${Math.round(c.temperature_2m)}<span class="t-unit">°F</span></div>
      <div class="t-note">${tempNote}</div>
    </div>
    <div class="weather-tile">
      <div class="t-label">Wind · ${compass(c.wind_direction_10m)}</div>
      <div class="t-value">${Math.round(c.wind_speed_10m)}<span class="t-unit">mph</span></div>
      <div class="t-note">${windNote}</div>
    </div>
    <div class="weather-tile">
      <div class="t-label">UV index</div>
      <div class="t-value">${Math.round(c.uv_index || 0)}</div>
      <div class="t-note">${uvNote}</div>
    </div>
    <div class="weather-tile">
      <div class="t-label">Rain today</div>
      <div class="t-value">${d.precipitation_probability_max[0]||0}<span class="t-unit">%</span></div>
      <div class="t-note">${rainNote}</div>
    </div>
  `;
}
