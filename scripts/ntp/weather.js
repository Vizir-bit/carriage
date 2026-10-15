const CARRIAGE_WEATHER_URL="https://api.open-meteo.com/v1/forecast?latitude=51.5074,48.8566,41.9028,55.7558&longitude=-0.1278,2.3522,12.4964,37.6173&current=temperature_2m,is_day,cloud_cover,uv_index&daily=sunshine_duration,daylight_duration&timezone=auto&forecast_days=1";
const CARRIAGE_WEATHER_KEY="carriageWeather.v1";
const CARRIAGE_WEATHER_TTL=15*60*1e3;
let carriageWeatherState=[];
function carriageWeatherParse(data){return (Array.isArray(data)?data:[data]).map((d=>{const c=d&&d.current||{};const y=d&&d.daily||{};const sun=Number(y.sunshine_duration?.[0]??NaN);const light=Number(y.daylight_duration?.[0]??NaN);return{temp:Number(c.temperature_2m),isDay:c.is_day===1,cloud:Number(c.cloud_cover),uv:Number(c.uv_index),sunHours:sun/3600,sunShare:light>0?Math.max(0,Math.min(1,sun/light)):0}}))}
function carriageWeatherLoad(){try{const raw=window.localStorage.getItem(CARRIAGE_WEATHER_KEY);if(!raw){return 0}const cached=JSON.parse(raw);carriageWeatherState=carriageWeatherParse(cached.data);return Number(cached.at)||0}catch(e){return 0}}
async function carriageWeatherRefresh(force){const at=carriageWeatherLoad();if(!force&&Date.now()-at<CARRIAGE_WEATHER_TTL){return}try{const response=await fetch(CARRIAGE_WEATHER_URL,{credentials:"omit",referrerPolicy:"no-referrer",cache:"no-store"});if(!response.ok){console.warn("carriage-weather: HTTP "+response.status);return}const data=await response.json();carriageWeatherState=carriageWeatherParse(data);window.localStorage.setItem(CARRIAGE_WEATHER_KEY,JSON.stringify({at:Date.now(),data:data}));console.info("carriage-weather: ok "+carriageWeatherState.length)}catch(e){console.warn("carriage-weather: "+(e&&e.message||e))}}
carriageWeatherRefresh(false);
window.setInterval((()=>carriageWeatherRefresh(false)),60*1e3);
function carriageFmtHours(h){if(!isFinite(h)){return"–"}const m=Math.round(h*60);return`${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}`}
function carriagePlaque(clock){const w=clock.weather;const has=!!w&&isFinite(w.temp);const t=has?w.temp:NaN;const level=has?Math.max(0,Math.min(1,(t+20)/60)):0;const mercuryTop=36-level*30;const share=has?w.sunShare:0;const arcLen=50.27;const sunOpacity=has?(w.isDay?Math.max(0.35,1-(isFinite(w.cloud)?w.cloud:0)/140):0.25):0.25;const uv=has&&isFinite(w.uv)?Math.round(w.uv):null;return html`
      <div class="carriage-plaque" title="${has?`${clock.city}: ${t.toFixed(1)} °C, sunshine today ${carriageFmtHours(w.sunHours)} (${Math.round(share*100)} % of daylight)${uv!==null?`, UV index ${uv}`:""}`:`${clock.city}: weather not available yet`}">
        <div class="carriage-gauge">
          <svg class="carriage-thermo" viewBox="0 0 20 52" aria-hidden="true">
            <rect x="6" y="2" width="8" height="38" rx="4" class="tube"></rect>
            <rect x="8" y="${mercuryTop}" width="4" height="${42-mercuryTop}" rx="2" class="mercury"></rect>
            <circle cx="10" cy="43" r="6.5" class="bulb-ring"></circle>
            <circle cx="10" cy="43" r="4.8" class="mercury"></circle>
            <path class="ticks" d="M15 6h3M15 11h2M15 16h3M15 21h2M15 26h3M15 31h2M15 36h3"></path>
          </svg>
          <div class="carriage-reading">
            <div class="carriage-value">${has?`${Math.round(t)}°`:"–"}</div>
            <div class="carriage-label">TEMP</div>
          </div>
        </div>
        <div class="carriage-gauge">
          <svg class="carriage-sun" viewBox="0 0 44 30" aria-hidden="true">
            <path class="track" d="M6 26a16 16 0 0 1 32 0"></path>
            <path class="fill" d="M6 26a16 16 0 0 1 32 0" stroke-dasharray="${(share*arcLen).toFixed(2)} 60"></path>
            <g class="disc" opacity="${sunOpacity.toFixed(2)}">
              <circle cx="22" cy="23" r="5"></circle>
              <path d="M22 14.5v2.5M14.5 23h2.5M27 23h2.5M16.7 17.7l1.8 1.8M27.3 17.7l-1.8 1.8"></path>
            </g>
          </svg>
          <div class="carriage-reading">
            <div class="carriage-value">${has?carriageFmtHours(w.sunHours):"–"}</div>
            <div class="carriage-label">${uv!==null?`SUN · UV ${uv}`:"SUN"}</div>
          </div>
        </div>
      </div>`}
