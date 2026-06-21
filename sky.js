// sky.js — คำนวณ "ท้องฟ้าดูดาว" ตามพิกัด GPS ด้วย astronomy-engine
//   • ดาวเคราะห์ที่เห็นคืนนี้ (ถ้าไม่ระบุวัน = คืนนี้)
//   • ดาวเคียงเดือน (ระยะเชิงมุมจันทร์–ดาวเคราะห์)
//   • อุปราคาครั้งหน้า (สุริยุปราคาแบบเฉพาะที่ + จันทรุปราคาที่เห็นจากตำแหน่งนี้)
const A = require('astronomy-engine');

// ดาวเคราะห์ที่สนใจ (พุธ→เนปจูน) + ชื่อไทย
const PLANETS = [
  { body: A.Body.Mercury, en: 'Mercury', th: 'ดาวพุธ' },
  { body: A.Body.Venus,   en: 'Venus',   th: 'ดาวศุกร์' },
  { body: A.Body.Mars,    en: 'Mars',    th: 'ดาวอังคาร' },
  { body: A.Body.Jupiter, en: 'Jupiter', th: 'ดาวพฤหัสบดี' },
  { body: A.Body.Saturn,  en: 'Saturn',  th: 'ดาวเสาร์' },
  { body: A.Body.Uranus,  en: 'Uranus',  th: 'ดาวยูเรนัส' },
  { body: A.Body.Neptune, en: 'Neptune', th: 'ดาวเนปจูน' },
];

const DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const dirName = (azDeg) => DIRS[Math.round(((azDeg % 360) + 360) % 360 / 22.5) % 16];

// ── ตัวช่วยฟอร์แมตเวลาให้เป็นเวลาท้องถิ่นของพิกัด ──
function makeFmt(tz) {
  const t = (d) =>
    d && !isNaN(d.getTime())
      ? d.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      : null;
  const ymd = (d) =>
    d && !isNaN(d.getTime())
      ? d.toLocaleString('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      : null;
  const dt = (d) => (t(d) && ymd(d) ? `${ymd(d)} ${t(d)}` : null);
  return { t, ymd, dt };
}

// offset (ms) ของ timezone ณ เวลานั้น → ใช้สร้าง "เที่ยงวันท้องถิ่น"
function tzOffsetMs(tz, date) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour === '24' ? 0 : p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

// เที่ยงวันท้องถิ่นของวันที่ที่ต้องการ (ถ้าไม่ระบุ = วันนี้ตาม tz)
function localNoon(dateStr, tz) {
  let y, m, d;
  if (dateStr) {
    [y, m, d] = dateStr.split('-').map(Number);
  } else {
    [y, m, d] = new Date().toLocaleDateString('en-CA', { timeZone: tz }).split('-').map(Number);
  }
  const guess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Date(guess.getTime() - tzOffsetMs(tz, guess));
}

function altAz(body, obs, date) {
  const eq = A.Equator(body, date, obs, true, true);
  const h = A.Horizon(date, obs, eq.ra, eq.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}

// ระยะเชิงมุมระหว่างสองวัตถุ (องศา) จากเวกเตอร์ศูนย์กลางโลก
function separationDeg(b1, b2, date) {
  const v1 = A.GeoVector(b1, date, true), v2 = A.GeoVector(b2, date, true);
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const m1 = Math.hypot(v1.x, v1.y, v1.z), m2 = Math.hypot(v2.x, v2.y, v2.z);
  return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * 180 / Math.PI;
}

const STEP_MS = 10 * 60 * 1000; // สุ่มทุก 10 นาที

function computeSky(lat, lng, tz, dateStr) {
  const obs = new A.Observer(lat, lng, 0);
  const F = makeFmt(tz);
  const noon = localNoon(dateStr, tz);

  // หาช่วงกลางคืน: ตั้งแต่ดวงอาทิตย์ตก → ขึ้นรอบถัดไป
  const sunset = A.SearchRiseSet(A.Body.Sun, obs, -1, noon, 2);
  const sunrise = sunset ? A.SearchRiseSet(A.Body.Sun, obs, +1, sunset.date, 2) : null;
  const nightStart = sunset ? sunset.date : noon;
  const nightEnd = sunrise ? sunrise.date : new Date(noon.getTime() + 12 * 3600 * 1000);
  const nightMs = nightEnd.getTime() - nightStart.getTime();

  // ── ดาวเคราะห์ที่เห็นคืนนี้ ──
  const planets = [];
  const conjunctions = [];
  for (const P of PLANETS) {
    // หาความสูงสูงสุด + เวลาที่ระยะห่างจันทร์ใกล้สุด ในช่วงกลางคืน
    let best = { alt: -99, t: null, az: 0 };
    let firstUp = null, lastUp = null;
    let minSep = 999, minSepT = null, moonAltAtMin = null, planetAltAtMin = null;
    for (let ms = nightStart.getTime(); ms <= nightEnd.getTime(); ms += STEP_MS) {
      const d = new Date(ms);
      const { alt, az } = altAz(P.body, obs, d);
      if (alt > best.alt) best = { alt, t: d, az };
      if (alt > 5) { if (firstUp === null) firstUp = d; lastUp = d; }
      const sep = separationDeg(A.Body.Moon, P.body, d);
      if (sep < minSep) {
        minSep = sep; minSepT = d;
        moonAltAtMin = altAz(A.Body.Moon, obs, d).alt;
        planetAltAtMin = alt;
      }
    }

    const mag = A.Illumination(P.body, best.t || nightStart).mag;
    const rise = A.SearchRiseSet(P.body, obs, +1, noon, 2);
    const set = A.SearchRiseSet(P.body, obs, -1, noon, 2);
    const transit = A.SearchHourAngle(P.body, obs, 0, noon);

    const visible = best.alt > 5;
    let when = null, whenKey = null;
    if (visible && best.t) {
      const frac = (best.t.getTime() - nightStart.getTime()) / nightMs;
      const allNight = firstUp && lastUp &&
        (firstUp.getTime() - nightStart.getTime()) < nightMs * 0.15 &&
        (nightEnd.getTime() - lastUp.getTime()) < nightMs * 0.15;
      if (allNight) { whenKey = 'mostNight'; when = 'เกือบทั้งคืน'; }
      else if (frac < 0.34) { whenKey = 'evening'; when = 'หัวค่ำ'; }
      else if (frac > 0.66) { whenKey = 'morning'; when = 'เช้ามืด'; }
      else { whenKey = 'lateNight'; when = 'กลางดึก'; }
    }

    planets.push({
      name: P.en,
      nameTh: P.th,
      visible,
      nakedEye: mag <= 6,           // ตาเปล่าเห็น (ยูเรนัส/เนปจูนต้องใช้กล้อง)
      magnitude: Math.round(mag * 10) / 10,
      rise: rise ? F.t(rise.date) : null,
      set: set ? F.t(set.date) : null,
      transit: transit ? F.t(transit.time.date) : null,
      maxAltitude: visible ? Math.round(best.alt) : null,
      azimuthAtMax: visible ? Math.round(best.az) : null,
      directionAtMax: visible ? dirName(best.az) : null,
      bestTime: visible ? F.t(best.t) : null,
      when, // หัวค่ำ / กลางดึก / เช้ามืด / เกือบทั้งคืน (ไทย)
      whenKey, // evening / lateNight / morning / mostNight (สำหรับ i18n ฝั่ง frontend)
      note: visible
        ? `${when} ทาง${dirName(best.az)} สูงสุด ~${Math.round(best.alt)}°`
        : 'คืนนี้อยู่ใต้/เกือบขอบฟ้า ไม่เหมาะดู',
    });

    // ── ดาวเคียงเดือน (ระยะ < 8°) ──
    if (minSep < 8) {
      conjunctions.push({
        name: P.en,
        nameTh: P.th,
        separationDeg: Math.round(minSep * 10) / 10,
        time: F.t(minSepT),
        observable: moonAltAtMin > 0 && planetAltAtMin > 0, // ทั้งคู่อยู่เหนือขอบฟ้าตอนนั้น
        note: `${P.th}เคียงเดือน ห่าง ~${Math.round(minSep * 10) / 10}°`,
      });
    }
  }

  // เรียง: เห็นได้ก่อน แล้วสว่างก่อน
  planets.sort((a, b) => (b.visible - a.visible) || (a.magnitude - b.magnitude));
  conjunctions.sort((a, b) => a.separationDeg - b.separationDeg);

  // ── อุปราคา (ค้นหาครั้งถัดไปนับจากวันที่ที่ดู; ไม่ระบุ = วันนี้) ──
  const since = noon;
  // สุริยุปราคา: หาแบบเฉพาะที่ (เห็นจากพิกัดนี้) ครั้งถัดไปพร้อมสถานการณ์ท้องถิ่น
  let nextSolar = null;
  try {
    const se = A.SearchLocalSolarEclipse(since, obs);
    nextSolar = {
      date: F.ymd(se.peak.time.date),
      kind: se.kind, // partial / annular / total
      obscurationPct: Math.round(se.obscuration * 1000) / 10,
      visibleHere: se.peak.altitude > 0,
      partialBegin: F.dt(se.partial_begin && se.partial_begin.time.date),
      peak: F.dt(se.peak.time.date),
      partialEnd: F.dt(se.partial_end && se.partial_end.time.date),
      sunAltitudeAtPeak: Math.round(se.peak.altitude),
      note: `${eclipseKindTh(se.kind, 'solar')} ${F.ymd(se.peak.time.date)} บดบัง ~${Math.round(se.obscuration * 100)}%`,
    };
  } catch (e) { nextSolar = null; }

  // จันทรุปราคา: ไล่หาครั้งถัดไปที่ "ดวงจันทร์อยู่เหนือขอบฟ้า ณ จุดสูงสุด" (เห็นจากที่นี่)
  let nextLunar = null;
  try {
    let le = A.SearchLunarEclipse(since);
    for (let i = 0; i < 15; i++) {
      const peakDate = le.peak.date;
      const moonAlt = altAz(A.Body.Moon, obs, peakDate).alt;
      if (moonAlt > 0) {
        const minToMs = (m) => m * 60 * 1000;
        nextLunar = {
          date: F.ymd(peakDate),
          kind: le.kind, // penumbral / partial / total
          obscurationPct: Math.round(le.obscuration * 1000) / 10,
          visibleHere: true,
          peak: F.dt(peakDate),
          moonAltitudeAtPeak: Math.round(moonAlt),
          partialBegin: le.sd_partial ? F.dt(new Date(peakDate.getTime() - minToMs(le.sd_partial))) : null,
          partialEnd: le.sd_partial ? F.dt(new Date(peakDate.getTime() + minToMs(le.sd_partial))) : null,
          totalBegin: le.sd_total ? F.dt(new Date(peakDate.getTime() - minToMs(le.sd_total))) : null,
          totalEnd: le.sd_total ? F.dt(new Date(peakDate.getTime() + minToMs(le.sd_total))) : null,
          note: `${eclipseKindTh(le.kind, 'lunar')} ${F.ymd(peakDate)} (ดวงจันทร์สูง ~${Math.round(moonAlt)}°)`,
        };
        break;
      }
      le = A.NextLunarEclipse(le.peak);
    }
  } catch (e) { nextLunar = null; }

  return {
    location: { lat, lng },
    timezone: tz,
    date: F.ymd(nightStart),
    night: { start: F.t(nightStart), end: F.t(nightEnd) },
    planets,
    moonConjunctions: conjunctions,
    eclipses: { nextSolar, nextLunar },
  };
}

function eclipseKindTh(kind, type) {
  if (type === 'solar') {
    if (kind === 'total') return 'สุริยุปราคาเต็มดวง';
    if (kind === 'annular') return 'สุริยุปราคาวงแหวน';
    return 'สุริยุปราคาบางส่วน';
  }
  if (kind === 'total') return 'จันทรุปราคาเต็มดวง';
  if (kind === 'partial') return 'จันทรุปราคาบางส่วน';
  return 'จันทรุปราคาเงามัว';
}

module.exports = { computeSky };
