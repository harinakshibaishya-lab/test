/* ==========================================================================
   ATMOS — script.js
   No API key needed: everything comes from Open-Meteo's free endpoints.
     - geocoding-api.open-meteo.com  → turn a city name into lat/lon
     - api.open-meteo.com            → current / hourly / daily weather
     - air-quality-api.open-meteo.com→ current US AQI

   The file is split into five parts:
     1. WMO weather-code dictionary (condition text + animation category)
     2. Data fetching helpers
     3. DOM rendering (fills in the HTML with real numbers)
     4. The "Living Sky" canvas — the signature animated background
     5. Wiring: search form, locate button, unit toggle, recent chips
   ========================================================================== */


/* ------------------------------------------------------------------ */
/* 1. WEATHER CODES                                                    */
/* Open-Meteo returns a numeric WMO code. We map each one to a label   */
/* the user reads, and a "category" the sky animation reacts to.      */
/* ------------------------------------------------------------------ */
const WMO = {
  0:  { label: 'Clear sky',            cat: 'clear'  },
  1:  { label: 'Mainly clear',         cat: 'clear'  },
  2:  { label: 'Partly cloudy',        cat: 'cloudy' },
  3:  { label: 'Overcast',             cat: 'cloudy' },
  45: { label: 'Fog',                  cat: 'fog'    },
  48: { label: 'Icy fog',              cat: 'fog'    },
  51: { label: 'Light drizzle',        cat: 'rain'   },
  53: { label: 'Drizzle',              cat: 'rain'   },
  55: { label: 'Dense drizzle',        cat: 'rain'   },
  56: { label: 'Freezing drizzle',     cat: 'rain'   },
  57: { label: 'Freezing drizzle',     cat: 'rain'   },
  61: { label: 'Light rain',           cat: 'rain'   },
  63: { label: 'Rain',                 cat: 'rain'   },
  65: { label: 'Heavy rain',           cat: 'rain'   },
  66: { label: 'Freezing rain',        cat: 'rain'   },
  67: { label: 'Freezing rain',        cat: 'rain'   },
  71: { label: 'Light snow',           cat: 'snow'   },
  73: { label: 'Snow',                 cat: 'snow'   },
  75: { label: 'Heavy snow',           cat: 'snow'   },
  77: { label: 'Snow grains',          cat: 'snow'   },
  80: { label: 'Rain showers',         cat: 'rain'   },
  81: { label: 'Rain showers',         cat: 'rain'   },
  82: { label: 'Violent rain showers', cat: 'rain'   },
  85: { label: 'Snow showers',         cat: 'snow'   },
  86: { label: 'Heavy snow showers',   cat: 'snow'   },
  95: { label: 'Thunderstorm',         cat: 'storm'  },
  96: { label: 'Thunderstorm + hail',  cat: 'storm'  },
  99: { label: 'Severe thunderstorm',  cat: 'storm'  },
};
const codeInfo = (code) => WMO[code] || { label: 'Unknown', cat: 'cloudy' };

/* tiny emoji set used only inline in the hourly/daily lists (the real
   "icon" of the app is the animated sky, this is just a quick glance aid) */
const EMOJI = { clear:'☀️', cloudy:'⛅', fog:'🌫️', rain:'🌧️', snow:'❄️', storm:'⛈️' };


/* ------------------------------------------------------------------ */
/* 2. DATA FETCHING                                                    */
/* ------------------------------------------------------------------ */

async function geocodeCity(name){
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=en&format=json`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.results || !json.results.length) throw new Error('CITY_NOT_FOUND');

  // Prefer the most populous match — a bare city name (e.g. "Springfield",
  // "Guwahati") can match several small same-named places, and the API
  // doesn't always list the well-known city first. Falling back to
  // population avoids silently fetching weather for the wrong town.
  const results = [...json.results].sort((a, b) => (b.population || 0) - (a.population || 0));
  const r = results[0];

  return {
    name: r.name,
    admin: r.admin1 ? `${r.admin1}, ${r.country}` : r.country,
    lat: r.latitude,
    lon: r.longitude,
  };
}

async function fetchWeather(lat, lon){
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,visibility',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max',
    timezone: 'auto',
    forecast_days: 7,
    cell_selection: 'nearest', // use the closest real grid point, not a smoothed "representative" land cell
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('WEATHER_FETCH_FAILED');
  return res.json();
}

async function fetchAirQuality(lat, lon){
  const params = new URLSearchParams({ latitude: lat, longitude: lon, current: 'us_aqi', timezone: 'auto' });
  try {
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.current ? json.current.us_aqi : null;
  } catch { return null; } // AQI is a nice-to-have, never block the app on it
}

function aqiTag(aqi){
  if (aqi == null) return '—';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy (sensitive)';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}
function uvTag(uv){
  if (uv == null) return '—';
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}


/* ------------------------------------------------------------------ */
/* 3. RENDERING                                                        */
/* rawData holds the last full response in Celsius/km — toggling the  */
/* unit re-renders from this cache instead of re-fetching.            */
/* ------------------------------------------------------------------ */
let rawData = null;
let lastPlace = null;
let currentUnit = 'C';
const recentCities = []; // { name, lat, lon } — in-memory only, no storage

const $ = (id) => document.getElementById(id);
const cToF = (c) => (c * 9/5) + 32;
const fmtTemp = (c) => Math.round(currentUnit === 'C' ? c : cToF(c));

function show(el){ el.hidden = false; }
function hide(el){ el.hidden = true; }

function setStatus(msg){
  show($('statusPanel'));
  hide($('mainContent'));
  $('statusText').textContent = msg;
}

function renderAll(place){
  lastPlace = place;
  const d = rawData;
  const cur = d.current;
  const info = codeInfo(cur.weather_code);

  hide($('statusPanel'));
  show($('mainContent'));

  // ---- Hero ----
  $('placeName').textContent = place.name;
  const elev = d.elevation != null ? ` · ${Math.round(d.elevation)}m elev.` : '';
  $('placeCoords').textContent = `${place.lat.toFixed(3)}°, ${place.lon.toFixed(3)}°  ·  ${place.admin || ''}${elev}`;
  $('temperature').textContent = fmtTemp(cur.temperature_2m);
  $('tempUnitLabel').textContent = `°${currentUnit}`;
  $('condition').textContent = info.label;
  $('feelsLike').textContent = `FEELS LIKE ${fmtTemp(cur.apparent_temperature)}°`;
  $('tempMax').textContent = `${fmtTemp(d.daily.temperature_2m_max[0])}°`;
  $('tempMin').textContent = `${fmtTemp(d.daily.temperature_2m_min[0])}°`;

  // ---- Sun arc ----
  const sunrise = new Date(d.daily.sunrise[0]);
  const sunset  = new Date(d.daily.sunset[0]);
  const now     = new Date();
  $('sunrise').textContent = sunrise.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  $('sunset').textContent  = sunset.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  const dayFrac = (now - sunrise) / (sunset - sunrise);
  $('sunDot').style.left = `${Math.min(100, Math.max(0, dayFrac * 100))}%`;
  $('sunDot').style.opacity = (dayFrac >= 0 && dayFrac <= 1) ? '1' : '0';
  $('lastUpdated').textContent = `last read ${now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;

  // ---- Instrument grid ----
  $('humidity').textContent = Math.round(cur.relative_humidity_2m);
  $('humidityBar').style.width = `${cur.relative_humidity_2m}%`;

  $('wind').textContent = Math.round(cur.wind_speed_10m);
  $('windArrow').style.transform = `translate(-50%,-100%) rotate(${cur.wind_direction_10m}deg)`;

  $('pressure').textContent = Math.round(cur.surface_pressure);
  $('pressureBar').style.width = `${Math.min(100, Math.max(0, (cur.surface_pressure - 970) / (1050-970) * 100))}%`;

  const uvNow = d.daily.uv_index_max[0];
  $('uv').textContent = uvNow != null ? uvNow.toFixed(1) : '--';
  $('uvTag').textContent = uvTag(uvNow);

  // nearest hourly visibility reading to "now"
  const hourIdx = nearestHourIndex(d.hourly.time);
  const visKm = d.hourly.visibility ? (d.hourly.visibility[hourIdx] / 1000) : null;
  $('visibility').textContent = visKm != null ? visKm.toFixed(1) : '--';
  $('visibilityBar').style.width = visKm != null ? `${Math.min(100, visKm/20*100)}%` : '0%';

  $('aqi').textContent = d.aqi != null ? Math.round(d.aqi) : '--';
  $('aqiTag').textContent = aqiTag(d.aqi);

  // ---- Hourly strip (next 24h from now) ----
  const strip = $('hourlyStrip');
  strip.innerHTML = '';
  for (let i = hourIdx; i < Math.min(hourIdx + 24, d.hourly.time.length); i++){
    const t = new Date(d.hourly.time[i]);
    const c = codeInfo(d.hourly.weather_code[i]);
    const card = document.createElement('div');
    card.className = 'hour-card';
    card.innerHTML = `
      <span class="h-time">${i === hourIdx ? 'Now' : t.toLocaleTimeString([], { hour:'2-digit' })}</span>
      <span class="h-icon">${EMOJI[c.cat]}</span>
      <span class="h-temp">${fmtTemp(d.hourly.temperature_2m[i])}°</span>
      <span class="h-rain">${d.hourly.precipitation_probability[i]}%</span>
    `;
    strip.appendChild(card);
  }

  // ---- 7-day list ----
  const list = $('dailyList');
  list.innerHTML = '';
  const weekMin = Math.min(...d.daily.temperature_2m_min);
  const weekMax = Math.max(...d.daily.temperature_2m_max);
  d.daily.time.forEach((iso, i) => {
    const date = new Date(iso);
    const dayName = i === 0 ? 'Today' : date.toLocaleDateString([], { weekday: 'short' });
    const c = codeInfo(d.daily.weather_code[i]);
    const lo = d.daily.temperature_2m_min[i], hi = d.daily.temperature_2m_max[i];
    const left = ((lo - weekMin) / (weekMax - weekMin)) * 100;
    const width = Math.max(6, ((hi - lo) / (weekMax - weekMin)) * 100);

    const row = document.createElement('div');
    row.className = 'day-row';
    row.innerHTML = `
      <span class="day-name">${dayName}</span>
      <span class="day-icon">${EMOJI[c.cat]}</span>
      <span class="day-bar-track"><span class="day-bar-fill" style="left:${left}%;width:${width}%"></span></span>
      <span class="day-range"><span>${fmtTemp(lo)}°</span> – ${fmtTemp(hi)}°</span>
    `;
    list.appendChild(row);
  });

  // ---- Drive the Living Sky ----
  setSky(info.cat, !!cur.is_day);

  // ---- Recent chips ----
  addRecent(place);
}

function nearestHourIndex(hourlyTimes){
  const now = Date.now();
  let bestI = 0, bestDiff = Infinity;
  hourlyTimes.forEach((t, i) => {
    const diff = Math.abs(new Date(t).getTime() - now);
    if (diff < bestDiff){ bestDiff = diff; bestI = i; }
  });
  return bestI;
}


/* ------------------------------------------------------------------ */
/* 4. LIVING SKY — the signature piece.                                */
/* A lightweight canvas particle system whose look is driven directly */
/* by the fetched condition + day/night, not a static picture.         */
/* ------------------------------------------------------------------ */
const canvas = $('sky');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
let sky = { cat: 'clear', isDay: true };
let particles = { stars: [], clouds: [], drops: [], flakes: [] };
let lastFlash = 0;

function resizeCanvas(){
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function rand(a,b){ return a + Math.random()*(b-a); }

function buildParticles(){
  particles.stars = Array.from({length: 90}, () => ({
    x: rand(0,W), y: rand(0,H*0.6), r: rand(.4,1.6), tw: rand(0, Math.PI*2)
  }));
  particles.clouds = Array.from({length: 6}, () => ({
    x: rand(0,W), y: rand(H*0.05, H*0.4), s: rand(.6,1.6), speed: rand(.05,.18)
  }));
  particles.drops = Array.from({length: 140}, () => ({
    x: rand(0,W), y: rand(0,H), len: rand(10,22), speed: rand(6,12)
  }));
  particles.flakes = Array.from({length: 110}, () => ({
    x: rand(0,W), y: rand(0,H), r: rand(1,3), speed: rand(.6,2), drift: rand(-.4,.4)
  }));
}
buildParticles();
window.addEventListener('resize', buildParticles);

function setSky(cat, isDay){
  sky = { cat, isDay };
}

function skyGradient(){
  const g = ctx.createLinearGradient(0,0,0,H);
  const palettes = {
    clear:  sky.isDay ? ['#3b6dd6','#8fc7ff'] : ['#050a18','#0b1120'],
    cloudy: sky.isDay ? ['#5b6f8c','#9fb0c4'] : ['#0c1220','#1b2436'],
    fog:    sky.isDay ? ['#7c8896','#c3cad2'] : ['#141a24','#232b38'],
    rain:   sky.isDay ? ['#39485c','#66788e'] : ['#080d16','#111a28'],
    snow:   sky.isDay ? ['#7e93ab','#dfe8f2'] : ['#0e1522','#1b2536'],
    storm:  ['#12141f','#2a2436'],
  };
  const [top, bottom] = palettes[sky.cat] || palettes.clear;
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

function drawClear(t){
  if (sky.isDay){
    // rotating sun with soft rays
    const cx = W*0.8, cy = H*0.22, r = 46;
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(t*0.00005);
    ctx.fillStyle = 'rgba(240,180,41,0.18)';
    for (let i=0;i<12;i++){
      ctx.rotate(Math.PI/6);
      ctx.fillRect(-3, -r-30, 6, 26);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.fillStyle = '#f7d774';
    ctx.shadowColor = '#f0b429';
    ctx.shadowBlur = 40;
    ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    particles.stars.forEach(s => {
      const tw = 0.55 + 0.45*Math.sin(t*0.002 + s.tw);
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
}

function drawClouds(alpha){
  ctx.fillStyle = `rgba(226,232,240,${alpha})`;
  particles.clouds.forEach(c => {
    c.x += c.speed;
    if (c.x > W + 120) c.x = -120;
    const s = c.s;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 60*s, 22*s, 0, 0, Math.PI*2);
    ctx.ellipse(c.x+40*s, c.y+8*s, 42*s, 18*s, 0, 0, Math.PI*2);
    ctx.ellipse(c.x-40*s, c.y+6*s, 38*s, 16*s, 0, 0, Math.PI*2);
    ctx.fill();
  });
}

function drawRain(){
  ctx.strokeStyle = 'rgba(56,189,248,0.5)';
  ctx.lineWidth = 1.4;
  particles.drops.forEach(d => {
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x-2, d.y+d.len);
    ctx.stroke();
    d.y += d.speed;
    d.x -= 0.6;
    if (d.y > H){ d.y = -20; d.x = rand(0,W); }
  });
}

function drawSnow(){
  ctx.fillStyle = 'rgba(241,245,249,0.85)';
  particles.flakes.forEach(f => {
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI*2);
    ctx.fill();
    f.y += f.speed;
    f.x += f.drift;
    if (f.y > H){ f.y = -10; f.x = rand(0,W); }
  });
}

function drawStorm(t){
  drawClouds(0.5);
  drawRain();
  if (t - lastFlash > rand(2500,6000)){
    lastFlash = t;
    ctx.fillStyle = 'rgba(226,232,240,0.35)';
    ctx.fillRect(0,0,W,H);
  }
}

function drawFog(){
  for (let i=0;i<4;i++){
    ctx.fillStyle = `rgba(226,232,240,${0.05+i*0.02})`;
    ctx.fillRect(0, H*0.3 + i*40, W, 60);
  }
}

function tick(t){
  ctx.fillStyle = skyGradient();
  ctx.fillRect(0,0,W,H);

  switch (sky.cat){
    case 'clear':  drawClear(t); break;
    case 'cloudy': drawClear(t); drawClouds(0.35); break;
    case 'fog':    drawFog(); break;
    case 'rain':   drawClouds(0.4); drawRain(); break;
    case 'snow':   drawClouds(0.3); drawSnow(); break;
    case 'storm':  drawStorm(t); break;
    default:       drawClear(t);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);


/* ------------------------------------------------------------------ */
/* 5. WIRING — search, geolocation, unit toggle, recent chips          */
/* ------------------------------------------------------------------ */
async function loadPlace(place){
  try {
    setStatus(`Reading the sky over ${place.name}…`);
    const [weather, aqi] = await Promise.all([
      fetchWeather(place.lat, place.lon),
      fetchAirQuality(place.lat, place.lon),
    ]);
    weather.aqi = aqi;
    rawData = weather;
    renderAll(place);
  } catch (err){
    setStatus(
      err.message === 'CITY_NOT_FOUND'
        ? 'Couldn\u2019t find that place. Try a different spelling.'
        : 'The sky isn\u2019t answering right now — check your connection and try again.'
    );
  }
}

function addRecent(place){
  const exists = recentCities.find(c => c.name === place.name && c.lat === place.lat);
  if (!exists){
    recentCities.unshift(place);
    if (recentCities.length > 5) recentCities.pop();
  }
  const box = $('recentChips');
  box.innerHTML = '';
  if (recentCities.length){
    show(box);
    recentCities.forEach(c => {
      const btn = document.createElement('button');
      btn.textContent = c.name;
      btn.addEventListener('click', () => loadPlace(c));
      box.appendChild(btn);
    });
  }
}

$('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const val = $('searchInput').value.trim();
  if (!val) return;
  try {
    setStatus(`Looking up “${val}”…`);
    const place = await geocodeCity(val);
    $('searchInput').value = '';
    loadPlace(place);
  } catch {
    setStatus('Couldn\u2019t find that place. Try a different spelling.');
  }
});

$('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation){
    setStatus('Geolocation isn\u2019t available in this browser.');
    return;
  }
  setStatus('Finding you…');
  navigator.geolocation.getCurrentPosition(
    (pos) => loadPlace({ name: 'Your location', admin: '', lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => setStatus('Couldn\u2019t get your location — search for a city instead.')
  );
});

$('unitToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-unit]');
  if (!btn) return;
  currentUnit = btn.dataset.unit;
  [...$('unitToggle').children].forEach(b => b.classList.toggle('active', b === btn));
  if (rawData && lastPlace){
    renderAll(lastPlace);
  }
});

/* ---- initial load: try geolocation quietly, fall back to a default city ---- */
(function init(){
  const fallback = { name: 'New Delhi', admin: 'Delhi, India', lat: 28.6139, lon: 77.2090 };
  if (navigator.geolocation){
    navigator.geolocation.getCurrentPosition(
      (pos) => loadPlace({ name: 'Your location', admin: '', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => loadPlace(fallback),
      { timeout: 4000 }
    );
  } else {
    loadPlace(fallback);
  }
})();