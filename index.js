require('dotenv').config();
const express = require('express');
const SunCalc = require('suncalc');
const tzlookup = require('tz-lookup'); // หา timezone จากพิกัด GPS (ออฟไลน์)
const { computeSky } = require('./sky'); // ดาวเคราะห์/เคียงเดือน/อุปราคา
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// เปิด CORS — หน้าเว็บ (weaq.cc) ยิงข้าม origin มาที่ moon.weaq.cc/api ได้
// เป็น API อ่านอย่างเดียว สาธารณะ จึงอนุญาตทุก origin
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

const H = 60 * 60 * 1000;   // 1 ชั่วโมง (ms)
const MIN = 60 * 1000;      // 1 นาที (ms)

app.get('/api/moon-times', (req, res) => {
    const { location, year, month } = req.query;
    if (!location || !year || !month) {
        return res.status(400).json({ error: 'Latitude, Longitude, Year, and Month are required.' });
    }
    const cleanlocation = location.replace(/\s+/g, '');
    const [latStr, lngStr] = cleanlocation.split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid location format. Use "latitude,longitude".' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Coordinates out of range. lat: -90..90, lng: -180..180.' });
    }

    // timezone ของพิกัดนี้ (เช่น "Asia/Bangkok") — ใช้ฟอร์แมตเวลาให้เป็นเวลาท้องถิ่นของตําแหน่ง
    let tz;
    try {
        tz = tzlookup(lat, lng);
    } catch (e) {
        return res.status(400).json({ error: 'Could not determine timezone for the given coordinates.' });
    }
    const monthInt = parseInt(month, 10);
    if (monthInt < 1 || monthInt > 12) {
        return res.status(400).json({ error: 'Invalid month. It must be between 1 and 12.' });
    }
    const yearInt = parseInt(year, 10);
    let date = new Date(yearInt, monthInt - 1, 1);
    const daysInMonth = new Date(yearInt, monthInt, 0).getDate();
    const result = [];

    for (let day = 1; day <= daysInMonth; day++) {
        date.setDate(day);
        const dayStartMs = date.getTime();

        const moonTimes = SunCalc.getMoonTimes(date, lat, lng);
        const sunTimes = SunCalc.getTimes(date, lat, lng);

        // ===== Transit จริง (upper/lower culmination) จากพิกัด =====
        // เลิกใช้ (moonrise+moonset)/2 — ดึงเวลาที่ดวงจันทร์ขึ้นสูงสุด/ต่ำสุดจริงจากเส้นทางพล็อต
        const transits = computeMoonTransits(date, lat, lng);
        const meridianPassing = transits.upper;          // จันทร์เหนือหัว (major)
        const oppositeMeridianPassing = transits.lower;  // จันทร์ใต้เท้า (major ตรงข้าม)

        const illumination = SunCalc.getMoonIllumination(date);
        const moonIllumination = illumination.fraction * 100;
        const phase = illumination.phase;          // 0..1
        const waxing = phase < 0.5;                // ข้างขึ้น = true, ข้างแรม = false
        const phName = phaseName(phase);
        // syzygy: ใกล้ "ดับ" หรือ "เพ็ญ" = 1, ครึ่งดวง = 0 (สมมาตรตามทฤษฎีแรงโน้มถ่วงรวม)
        const syzygy = Math.abs(illumination.fraction - 0.5) * 2; // 0..1

        const dark = computeDarkWindow(date, lat, lng); // ช่วงฟ้ามืดจริง
        const moonPosition = SunCalc.getMoonPosition(date, lat, lng);
        // ระยะใกล้สุดของวัน (สุ่มทุก 3 ชม.) ให้แม่นขึ้นสําหรับหา perigee/supermoon
        let moonDistance = moonPosition.distance;
        for (let hh = 3; hh < 24; hh += 3) {
            const dd = SunCalc.getMoonPosition(new Date(dayStartMs + hh * H), lat, lng).distance;
            if (dd < moonDistance) moonDistance = dd;
        }

        const formattedDate = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
        const fmt = (d) => (d && !isNaN(d.getTime())) ? d.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;

        const moonrise = fmt(moonTimes.rise);
        const moonset = fmt(moonTimes.set);
        const meridianTime = fmt(meridianPassing);
        const oppositeMeridianTime = fmt(oppositeMeridianPassing);
        const sunrise = fmt(sunTimes.sunrise);
        const sunset = fmt(sunTimes.sunset);
        const solarNoon = fmt(sunTimes.solarNoon);

        let daylength = null;
        if (sunTimes.sunrise && sunTimes.sunset) {
            const s = Math.floor((sunTimes.sunset.getTime() - sunTimes.sunrise.getTime()) / 1000);
            daylength = `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        }

        // ===== หน้าต่างเวลา (absolute timestamp ทั้งหมด — ไม่ใช้ clock-time แล้ว) =====
        const off = (d, ms) => (d && !isNaN(d.getTime())) ? new Date(d.getTime() + ms) : null;
        const thirtyMinutesBeforeMoonrise = off(moonTimes.rise, -30 * MIN);
        const thirtyMinutesAfterMoonrise  = off(moonTimes.rise, +30 * MIN);
        const thirtyMinutesBeforeMoonset   = off(moonTimes.set, -30 * MIN);
        const thirtyMinutesAfterMoonset    = off(moonTimes.set, +30 * MIN);
        const oneHourBeforeMeridian = off(meridianPassing, -H);
        const oneHourAfterMeridian  = off(meridianPassing, +H);
        const oneHourBeforeOppositeMeridian = off(oppositeMeridianPassing, -H);
        const oneHourAfterOppositeMeridian  = off(oppositeMeridianPassing, +H);

        // ===== huntStar — ให้คะแนนตามกฎ 4 ข้อ (อ้างอิงทฤษฎี Solunar) =====
        // เดินไทม์ไลน์ทีละ STEP ให้คะแนนเฉพาะ "ช่วงสำคัญ" (Major/Minor) แล้วบวกโบนัสตามเงื่อนไข
        //  กฎ1 Major: จันทร์เหนือหัว ±1ชม. และ ใต้เท้า ±1ชม.  → +2
        //  กฎ2 Minor: จันทร์ขึ้น ±30น. และ ตก ±30น.        → +1
        //  กฎ3 ช่วงสำคัญใกล้พระอาทิตย์ขึ้น/ตก: ≤30น. → +3, 30–60น. → +2 ; และถ้าตรงจันทร์ขึ้น/ตกด้วย → +1
        //  กฎ4 เฟส New(0–10%)/Full(90–100%) = ดับ/เพ็ญ ±3 วัน → คูณทั้งวัน ×1.5
        const STEP = 10 * MIN;
        const inWin = (t, w) => t >= w[0].getTime() && t <= w[1].getTime();
        const inAny = (t, wins) => wins.some(w => inWin(t, w));

        const majorWins = [
            [oneHourBeforeMeridian, oneHourAfterMeridian],              // เหนือหัว ±1ชม.
            [oneHourBeforeOppositeMeridian, oneHourAfterOppositeMeridian], // ใต้เท้า ±1ชม.
        ].filter(w => w[0] && w[1]);
        const minorWins = [
            [thirtyMinutesBeforeMoonrise, thirtyMinutesAfterMoonrise],  // จันทร์ขึ้น ±30น.
            [thirtyMinutesBeforeMoonset, thirtyMinutesAfterMoonset],    // จันทร์ตก ±30น.
        ].filter(w => w[0] && w[1]);
        const sunMarks = [];
        if (sunTimes.sunrise) sunMarks.push(sunTimes.sunrise.getTime());
        if (sunTimes.sunset)  sunMarks.push(sunTimes.sunset.getTime());
        const sunNear = (t) => sunMarks.length ? Math.min(...sunMarks.map(s => Math.abs(t - s))) : Infinity;

        let raw = 0;
        let majorMinutes = 0, minorMinutes = 0, sunBonusMinutes = 0, peakHits = 0;
        for (let t = dayStartMs; t < dayStartMs + 24 * H; t += STEP) {
            const inMajor = inAny(t, majorWins);   // ข้อ1: T ห่าง moonTransit/AntiTransit ≤1ชม.
            const inMinor = inAny(t, minorWins);   // ข้อ2: T ห่าง moonRise/moonDrop ≤30น.
            const sn = sunNear(t);                  // ข้อ3: T ห่าง sunRise/sunSet

            let pts = 0;
            if (inMajor) pts += 2;                              // ข้อ1 +2
            if (inMinor) pts += 1;                              // ข้อ2 +1
            if (sn <= 30 * MIN) pts += 3;                       // ข้อ3 ≤30น. +3
            else if (sn <= 60 * MIN) pts += 2;                  // ข้อ3 31–60น. +2
            if (inMinor && sn <= 30 * MIN) pts += 1;            // Bonus นาทีทอง: ข้อ2 + ข้อ3(≤30น.) พร้อมกัน +1
            if (pts === 0) continue;
            raw += pts * (STEP / H);                            // integrate → หน่วย "ชม.ถ่วงน้ำหนัก"

            // breakdown ไว้ debug/แสดงผล
            const stepMin = STEP / MIN;
            if (inMajor) majorMinutes += stepMin; else if (inMinor) minorMinutes += stepMin;
            if (sn <= 60 * MIN) sunBonusMinutes += stepMin;
            const hits = (inMajor ? 1 : 0) + (inMinor ? 1 : 0) + (sn <= 60 * MIN ? 1 : 0);
            if (hits > peakHits) peakHits = hits;
        }
        // ===== 2 ชั้นแบบ solunarforecast: ดาว=เฟส (คำนวณตอนสรุปเดือน), huntStar/peak=timing =====
        // huntStar = คะแนน timing ล้วน (Major+Minor+ตรงพระอาทิตย์) — ไม่คูณเฟสแล้ว (เฟสไปอยู่ที่ "ดาว")
        const dPhase = Math.min(moonIllumination, 100 - moonIllumination); // 0=ดับ/เพ็ญ, 50=ครึ่งดวง
        const phaseFavorable = dPhase <= 10; // ดับ/เพ็ญ ±3วัน (0–10% หรือ 90–100%)
        let huntStar = Math.round(raw * 100) / 100;

        // peak (0–4): "ตัวบวก +" — ช่วงสำคัญ (Major/Minor) ตรงพระอาทิตย์ขึ้น/ตกกี่ครั้ง
        //   เลียนแบบระบบ +/++ ของ solunarforecast: ตรง ±1ชม. = +1, ยิ่งใกล้ ±30น. = +1 อีก
        let peak = 0;
        [meridianPassing, oppositeMeridianPassing, moonTimes.rise, moonTimes.set].forEach((tt) => {
            if (!tt || isNaN(tt.getTime())) return;
            const dd = sunNear(tt.getTime());
            if (dd <= 60 * MIN) { peak += 1; if (dd <= 30 * MIN) peak += 1; }
        });
        peak = Math.min(peak, 4);


        // ===== ช่วงถ่ายภาพ: twilight ทุกเฟส (จาก SunCalc) =====
        const dawn = fmt(sunTimes.dawn);
        const dusk = fmt(sunTimes.dusk);
        const nauticalDawn = fmt(sunTimes.nauticalDawn);
        const nauticalDusk = fmt(sunTimes.nauticalDusk);
        const goldenHourEnd = fmt(sunTimes.goldenHourEnd);
        const goldenHour = fmt(sunTimes.goldenHour);

        // ===== ทิศที่ดวงจันทร์ขึ้น/ตก (azimuth) =====
        let moonriseAz = null, moonsetAz = null;
        if (moonTimes.rise) moonriseAz = azimuthInfo(SunCalc.getMoonPosition(moonTimes.rise, lat, lng).azimuth);
        if (moonTimes.set) moonsetAz = azimuthInfo(SunCalc.getMoonPosition(moonTimes.set, lat, lng).azimuth);

        result.push({
            location: cleanlocation, timezone: tz, date: formattedDate,
            moonrise, moonset, meridianPassing: meridianTime, oppositeMeridianPassing: oppositeMeridianTime,
            sunrise, sunset, solarNoon, daylength,
            thirtyMinutesBeforeMoonrise: fmt(thirtyMinutesBeforeMoonrise),
            thirtyMinutesAfterMoonrise: fmt(thirtyMinutesAfterMoonrise),
            thirtyMinutesBeforeMoonset: fmt(thirtyMinutesBeforeMoonset),
            thirtyMinutesAfterMoonset: fmt(thirtyMinutesAfterMoonset),
            oneHourBeforeMeridian: fmt(oneHourBeforeMeridian),
            oneHourAfterMeridian: fmt(oneHourAfterMeridian),
            oneHourBeforeOppositeMeridian: fmt(oneHourBeforeOppositeMeridian),
            oneHourAfterOppositeMeridian: fmt(oneHourAfterOppositeMeridian),
            illumination: moonIllumination.toFixed(2),
            phase: phase.toFixed(3),
            phaseName: phName,
            waxing: waxing,
            syzygy: Math.round(syzygy * 100) / 100,
            darkStart: fmt(dark.start),
            darkEnd: fmt(dark.end),
            darkDuration: dark.ms > 0
                ? `${String(Math.floor(dark.ms / 3600000)).padStart(2, '0')}:${String(Math.floor((dark.ms % 3600000) / 60000)).padStart(2, '0')}`
                : null,
            dawn, dusk, nauticalDawn, nauticalDusk, goldenHourEnd, goldenHour,
            moonriseAzimuth: moonriseAz ? moonriseAz.deg : null,
            moonriseDir: moonriseAz ? moonriseAz.dir : null,
            moonsetAzimuth: moonsetAz ? moonsetAz.deg : null,
            moonsetDir: moonsetAz ? moonsetAz.dir : null,
            distance: moonDistance.toFixed(2) + ' meters',
            distanceKm: Math.round(moonDistance),
            huntStar: huntStar,
            peak: peak,
            huntDetail: {
                majorMinutes, minorMinutes, sunBonusMinutes, peakHits, phaseFavorable,
                upperTransit: fmt(meridianPassing),
                lowerTransit: fmt(oppositeMeridianPassing),
            },
            meridianTimesAvailable: true, // transit คำนวณได้เสมอ แม้วันที่จันทร์ไม่ขึ้น/ไม่ตก
        });
    }

    // ===== สรุปรายเดือน: ให้ "ดาว 1–5" แบบ absolute + perigee/supermoon =====
    if (result.length) {
        const dists = result.map((r) => r.distanceKm);
        const minD = Math.min(...dists), maxD = Math.max(...dists);

        // ดาว 1–5 จาก "เฟสล้วน" (เลียนแบบ solunarforecast) — ใกล้ดับ/เพ็ญ = ดาวสูง
        //   เป็นค่า absolute เทียบข้ามเดือนได้ และทุกเดือนมีวันเด่น 4–5★ เสมอ (เพราะมีดับ+เพ็ญทุกเดือน)
        //   d = ระยะห่างจากดับ/เพ็ญ (%): 0=ดับ/เพ็ญพอดี, 50=ครึ่งดวง
        //   ส่วน timing (ตรงพระอาทิตย์) ไม่อยู่ในดาว — ไปอยู่ที่ peak ("+") แยกต่างหาก
        result.forEach((r) => {
            const ill = parseFloat(r.illumination);
            const d = Math.min(ill, 100 - ill);
            r.stars = d <= 1 ? 5 : d <= 6 ? 4 : d <= 12 ? 3 : d <= 25 ? 2 : 1;
        });

        // วันเพ็ญของเดือน = วันที่แสงสว่างมากที่สุด
        let fullIdx = 0;
        result.forEach((r, i) => {
            if (parseFloat(r.illumination) > parseFloat(result[fullIdx].illumination)) fullIdx = i;
        });
        result.forEach((r) => {
            r.isPerigee = r.distanceKm === minD;
            r.isApogee = r.distanceKm === maxD;
            r.supermoon = false;
            r.micromoon = false;
        });
        const f = result[fullIdx];
        if (parseFloat(f.illumination) >= 97) {
            if (f.distanceKm <= minD + 3000) f.supermoon = true;
            else if (f.distanceKm >= maxD - 3000) f.micromoon = true;
        }
    }

    res.json(result);
});

// ── /api/sky — ท้องฟ้าดูดาวตามพิกัด GPS ──
app.get('/api/sky', (req, res) => {
    const { location, date } = req.query;
    if (!location) {
        return res.status(400).json({ error: 'location (latitude,longitude) is required.' });
    }
    const clean = String(location).replace(/\s+/g, '');
    const [latStr, lngStr] = clean.split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid location format. Use "latitude,longitude".' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Coordinates out of range. lat: -90..90, lng: -180..180.' });
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    let tz;
    try {
        tz = tzlookup(lat, lng);
    } catch (e) {
        return res.status(400).json({ error: 'Could not determine timezone for the given coordinates.' });
    }
    try {
        res.json(computeSky(lat, lng, tz, date || null));
    } catch (e) {
        console.error('sky error:', e);
        res.status(500).json({ error: 'Failed to compute sky data.' });
    }
});

app.listen(port, () => { console.log(`Server running at http://localhost:${port}`); });

// ===== Helpers =====

// หา "เวลาผ่านเมอริเดียนจริง" (upper/lower transit) จากพิกัด
// พล็อตความสูง (altitude) ของดวงจันทร์ตลอดวัน แล้วหาจุดสูงสุด (จันทร์เหนือหัว)
// และจุดต่ำสุด (จันทร์ใต้เท้า) — แม่นกว่า (rise+set)/2 และได้ค่าแม้วันที่จันทร์ไม่ขึ้น/ไม่ตก
function computeMoonTransits(date, lat, lng) {
    const startMs = date.getTime();
    const coarse = 5 * 60 * 1000; // หยาบทุก 5 นาที
    let upT = startMs, upAlt = -Infinity, loT = startMs, loAlt = Infinity;
    for (let t = startMs; t < startMs + 24 * 60 * 60 * 1000; t += coarse) {
        const alt = SunCalc.getMoonPosition(new Date(t), lat, lng).altitude; // เรเดียน
        if (alt > upAlt) { upAlt = alt; upT = t; }
        if (alt < loAlt) { loAlt = alt; loT = t; }
    }
    // ละเอียดขึ้น ±5 นาที รอบจุดที่เจอ ที่ step 15 วินาที
    const refine = (centerMs, findMax) => {
        let bestT = centerMs, bestAlt = findMax ? -Infinity : Infinity;
        for (let t = centerMs - coarse; t <= centerMs + coarse; t += 15 * 1000) {
            const alt = SunCalc.getMoonPosition(new Date(t), lat, lng).altitude;
            if (findMax ? alt > bestAlt : alt < bestAlt) { bestAlt = alt; bestT = t; }
        }
        return bestT;
    };
    return {
        upper: new Date(refine(upT, true)),
        lower: new Date(refine(loT, false)),
        upperAlt: upAlt,
    };
}

// แปลง azimuth (เรเดียน, SunCalc วัดจากทิศใต้ตามเข็ม) → ทิศเข็มทิศ (0=N) + ชื่อทิศ 16 จุด
function azimuthInfo(azRad) {
    let deg = (azRad * 180 / Math.PI + 180) % 360;
    if (deg < 0) deg += 360;
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return { deg: Math.round(deg), dir: dirs[Math.round(deg / 22.5) % 16] };
}

// ชื่อเฟสดวงจันทร์จากค่า phase (0=ดับ, 0.25=ขึ้นครึ่งดวง, 0.5=เพ็ญ, 0.75=แรมครึ่งดวง)
function phaseName(phase) {
    const p = ((phase % 1) + 1) % 1;
    if (p < 0.03 || p > 0.97) return 'จันทร์ดับ';
    if (p < 0.22) return 'ข้างขึ้น เสี้ยว';
    if (p < 0.28) return 'ข้างขึ้น ครึ่งดวง';
    if (p < 0.47) return 'ข้างขึ้น ค่อนดวง';
    if (p < 0.53) return 'จันทร์เพ็ญ';
    if (p < 0.72) return 'ข้างแรม ค่อนดวง';
    if (p < 0.78) return 'ข้างแรม ครึ่งดวง';
    return 'ข้างแรม เสี้ยว';
}

// ช่วง "ฟ้ามืดจริง" สําหรับดูดาว = กลางคืนดาราศาสตร์ (ดวงอาทิตย์ต่ํากว่า -18°)
// ที่ดวงจันทร์อยู่ใต้ขอบฟ้าด้วย → คืนช่วงต่อเนื่องที่ยาวที่สุด
function computeDarkWindow(date, lat, lng) {
    const tonight = SunCalc.getTimes(date, lat, lng);
    const tomorrow = SunCalc.getTimes(new Date(date.getTime() + 24 * 60 * 60 * 1000), lat, lng);
    const nightStart = tonight.night;
    const nightEnd = tomorrow.nightEnd;
    if (!nightStart || !nightEnd || isNaN(nightStart.getTime()) || isNaN(nightEnd.getTime()) || nightEnd <= nightStart) {
        return { start: null, end: null, ms: 0 };
    }
    const step = 5 * 60 * 1000;
    let curStart = null, bestStart = null, bestEnd = null, bestLen = 0;
    for (let t = nightStart.getTime(); t <= nightEnd.getTime(); t += step) {
        const alt = SunCalc.getMoonPosition(new Date(t), lat, lng).altitude;
        if (alt < 0) {
            if (curStart === null) curStart = t;
        } else if (curStart !== null) {
            const len = t - curStart;
            if (len > bestLen) { bestLen = len; bestStart = curStart; bestEnd = t - step; }
            curStart = null;
        }
    }
    if (curStart !== null) {
        const len = nightEnd.getTime() - curStart;
        if (len > bestLen) { bestLen = len; bestStart = curStart; bestEnd = nightEnd.getTime(); }
    }
    if (bestStart === null) return { start: null, end: null, ms: 0 };
    return { start: new Date(bestStart), end: new Date(bestEnd), ms: bestLen };
}
