require('dotenv').config();
const express = require('express');
const SunCalc = require('suncalc');
const tzlookup = require('tz-lookup'); // หา timezone จากพิกัด GPS (ออฟไลน์)
const { computeSky } = require('./sky'); // ดาวเคราะห์/เคียงเดือน/อุปราคา
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

app.get('/api/moon-times', (req, res) => {
    const { location, year, month } = req.query;
    const cleanlocation = location.replace(/\s+/g, '');
    if (!location || !year || !month) {
        return res.status(400).json({ error: 'Latitude, Longitude, Year, and Month are required.' });
    }
    const [latStr, lngStr] = cleanlocation.split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: 'Invalid location format. Use "latitude,longitude".' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Coordinates out of range. lat: -90..90, lng: -180..180.' });
    }

    // timezone ของพิกัดนี้ (เช่น "Asia/Bangkok") — ใช้ฟอร์แมตเวลาให้เป็นเวลาท้องถิ่นของตำแหน่ง
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
        const moonTimes = SunCalc.getMoonTimes(date, lat, lng);
        const sunTimes = SunCalc.getTimes(date, lat, lng);
        let meridianPassing = null;
        if (moonTimes.rise && moonTimes.set) {
            meridianPassing = new Date((moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2);
        }
        let oppositeMeridianPassing = null;
        if (meridianPassing) {
            oppositeMeridianPassing = new Date(meridianPassing.getTime() + 12 * 60 * 60 * 1000);
        }
        const illumination = SunCalc.getMoonIllumination(date);
        const moonIllumination = illumination.fraction * 100;
        const phase = illumination.phase;          // 0..1
        const waxing = phase < 0.5;                // ข้างขึ้น = true, ข้างแรม = false
        const phName = phaseName(phase);
        const dark = computeDarkWindow(date, lat, lng); // ช่วงฟ้ามืดจริง
        const moonPosition = SunCalc.getMoonPosition(date, lat, lng);
        // ระยะใกล้สุดของวัน (สุ่มทุก 3 ชม.) ให้แม่นขึ้นสำหรับหา perigee/supermoon
        let moonDistance = moonPosition.distance;
        for (let hh = 3; hh < 24; hh += 3) {
            const dd = SunCalc.getMoonPosition(new Date(date.getTime() + hh * 60 * 60 * 1000), lat, lng).distance;
            if (dd < moonDistance) moonDistance = dd;
        }
        const formattedDate = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
        const moonrise = moonTimes.rise ? moonTimes.rise.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        const moonset = moonTimes.set ? moonTimes.set.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        const meridianTime = meridianPassing ? meridianPassing.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        const oppositeMeridianTime = oppositeMeridianPassing ? oppositeMeridianPassing.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        const sunrise = sunTimes.sunrise ? sunTimes.sunrise.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        const sunset = sunTimes.sunset ? sunTimes.sunset.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        const solarNoon = sunTimes.solarNoon ? sunTimes.solarNoon.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        let daylength = null;
        if (sunTimes.sunrise && sunTimes.sunset) {
            const dayLengthInMs = sunTimes.sunset.getTime() - sunTimes.sunrise.getTime();
            const s = Math.floor(dayLengthInMs / 1000);
            daylength = `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        }
        let thirtyMinutesBeforeMoonrise = null, thirtyMinutesAfterMoonrise = null;
        if (moonTimes.rise) {
            thirtyMinutesBeforeMoonrise = new Date(moonTimes.rise.getTime() - 30*60*1000);
            thirtyMinutesAfterMoonrise = new Date(moonTimes.rise.getTime() + 30*60*1000);
        }
        let thirtyMinutesBeforeMoonset = null, thirtyMinutesAfterMoonset = null;
        if (moonTimes.set) {
            thirtyMinutesBeforeMoonset = new Date(moonTimes.set.getTime() - 30*60*1000);
            thirtyMinutesAfterMoonset = new Date(moonTimes.set.getTime() + 30*60*1000);
        }
        let oneHourBeforeMeridian = null, oneHourAfterMeridian = null;
        if (meridianPassing) {
            oneHourBeforeMeridian = new Date(meridianPassing.getTime() - 60*60*1000);
            oneHourAfterMeridian = new Date(meridianPassing.getTime() + 60*60*1000);
        }
        let oneHourBeforeOppositeMeridian = null, oneHourAfterOppositeMeridian = null;
        if (oppositeMeridianPassing) {
            oneHourBeforeOppositeMeridian = new Date(oppositeMeridianPassing.getTime() - 60*60*1000);
            oneHourAfterOppositeMeridian = new Date(oppositeMeridianPassing.getTime() + 60*60*1000);
        }
        const fmt = (d) => (d && !isNaN(d.getTime())) ? d.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
        const formattedThirtyMinutesBeforeMoonrise = fmt(thirtyMinutesBeforeMoonrise);
        const formattedThirtyMinutesAfterMoonrise = fmt(thirtyMinutesAfterMoonrise);
        const formattedThirtyMinutesBeforeMoonset = fmt(thirtyMinutesBeforeMoonset);
        const formattedThirtyMinutesAfterMoonset = fmt(thirtyMinutesAfterMoonset);
        const formattedOneHourBeforeMeridian = fmt(oneHourBeforeMeridian);
        const formattedOneHourAfterMeridian = fmt(oneHourAfterMeridian);
        const formattedOneHourBeforeOppositeMeridian = fmt(oneHourBeforeOppositeMeridian);
        const formattedOneHourAfterOppositeMeridian = fmt(oneHourAfterOppositeMeridian);

        // ===== huntStar (Solunar score) =====
        // ใช้ isTimeBetween() ที่เทียบ Date timestamp (แก้บั๊กคร่อมเที่ยงคืน) — สูตรคะแนนเท่าเดิม
        let huntStar = 0;

        let oneHourBeforeSunrise = null, oneHourAfterSunrise = null;
        if (sunTimes.sunrise) {
            oneHourBeforeSunrise = new Date(sunTimes.sunrise.getTime() - 60 * 60 * 1000);
            oneHourAfterSunrise = new Date(sunTimes.sunrise.getTime() + 60 * 60 * 1000);
        }
        let oneHourBeforeSunset = null, oneHourAfterSunset = null;
        if (sunTimes.sunset) {
            oneHourBeforeSunset = new Date(sunTimes.sunset.getTime() - 60 * 60 * 1000);
            oneHourAfterSunset = new Date(sunTimes.sunset.getTime() + 60 * 60 * 1000);
        }

        const sunEdges = [oneHourBeforeSunrise, oneHourAfterSunrise, oneHourBeforeSunset, oneHourAfterSunset];

        // Major: ขอบ ±1ชม.ของดวงอาทิตย์ ตรงกับ เมอริเดียน/ตรงข้าม (±1ชม.) → +3 ต่อครั้ง
        sunEdges.forEach((t) => {
            if (isTimeBetween(t, oneHourBeforeMeridian, oneHourAfterMeridian)) huntStar += 3;
            if (isTimeBetween(t, oneHourBeforeOppositeMeridian, oneHourAfterOppositeMeridian)) huntStar += 3;
        });

        // Minor: ขอบ ±1ชม.ของดวงอาทิตย์ ตรงกับ จันทร์ขึ้น/ตก (±30นาที) → +2 ต่อครั้ง
        sunEdges.forEach((t) => {
            if (isTimeBetween(t, thirtyMinutesBeforeMoonrise, thirtyMinutesAfterMoonrise)) huntStar += 2;
            if (isTimeBetween(t, thirtyMinutesBeforeMoonset, thirtyMinutesAfterMoonset)) huntStar += 2;
        });

        // จันทร์ขึ้น/ตก ตรงกับ เมอริเดียน/ตรงข้าม/ช่วง±30นาที → +0.5 ต่อครั้ง
        [moonTimes.rise, moonTimes.set].forEach((t) => {
            if (isTimeBetween(t, oneHourBeforeMeridian, oneHourAfterMeridian)) huntStar += 0.5;
            if (isTimeBetween(t, oneHourBeforeOppositeMeridian, oneHourAfterOppositeMeridian)) huntStar += 0.5;
            if (isTimeBetween(t, thirtyMinutesBeforeMoonrise, thirtyMinutesAfterMoonrise)) huntStar += 0.5;
            if (isTimeBetween(t, thirtyMinutesBeforeMoonset, thirtyMinutesAfterMoonset)) huntStar += 0.5;
        });

        // แก้บั๊ก #2: โบนัสแสงจันทร์น้อย ใช้ค่า % จริง (moonIllumination)
        // เดิมเขียน if (illumination) แล้ว illumination > 0 && <= 10 ซึ่ง illumination เป็น object → NaN เลยไม่เคยทำงาน
        if (moonIllumination > 0 && moonIllumination <= 10) huntStar += 0.5;

        // ===== ช่วงถ่ายภาพ: twilight ทุกเฟส (จาก SunCalc) =====
        const dawn = fmt(sunTimes.dawn);                 // blue hour เช้า เริ่ม (civil)
        const dusk = fmt(sunTimes.dusk);                 // blue hour เย็น จบ (civil)
        const nauticalDawn = fmt(sunTimes.nauticalDawn);
        const nauticalDusk = fmt(sunTimes.nauticalDusk);
        const goldenHourEnd = fmt(sunTimes.goldenHourEnd); // golden hour เช้า จบ
        const goldenHour = fmt(sunTimes.goldenHour);       // golden hour เย็น เริ่ม

        // ===== ทิศที่ดวงจันทร์ขึ้น/ตก (azimuth) =====
        let moonriseAz = null, moonsetAz = null;
        if (moonTimes.rise) moonriseAz = azimuthInfo(SunCalc.getMoonPosition(moonTimes.rise, lat, lng).azimuth);
        if (moonTimes.set) moonsetAz = azimuthInfo(SunCalc.getMoonPosition(moonTimes.set, lat, lng).azimuth);

        result.push({
            location: cleanlocation, timezone: tz, date: formattedDate,
            moonrise, moonset, meridianPassing: meridianTime, oppositeMeridianPassing: oppositeMeridianTime,
            sunrise, sunset, solarNoon, daylength,
            thirtyMinutesBeforeMoonrise: formattedThirtyMinutesBeforeMoonrise,
            thirtyMinutesAfterMoonrise: formattedThirtyMinutesAfterMoonrise,
            thirtyMinutesBeforeMoonset: formattedThirtyMinutesBeforeMoonset,
            thirtyMinutesAfterMoonset: formattedThirtyMinutesAfterMoonset,
            oneHourBeforeMeridian: formattedOneHourBeforeMeridian,
            oneHourAfterMeridian: formattedOneHourAfterMeridian,
            oneHourBeforeOppositeMeridian: formattedOneHourBeforeOppositeMeridian,
            oneHourAfterOppositeMeridian: formattedOneHourAfterOppositeMeridian,
            illumination: moonIllumination.toFixed(2),
            phase: phase.toFixed(3),
            phaseName: phName,
            waxing: waxing,
            darkStart: fmt(dark.start),
            darkEnd: fmt(dark.end),
            darkDuration: dark.ms > 0
                ? `${String(Math.floor(dark.ms / 3600000)).padStart(2, '0')}:${String(Math.floor((dark.ms % 3600000) / 60000)).padStart(2, '0')}`
                : null,
            // ช่วงถ่ายภาพ (twilight)
            dawn, dusk, nauticalDawn, nauticalDusk, goldenHourEnd, goldenHour,
            // ทิศจันทร์ขึ้น/ตก
            moonriseAzimuth: moonriseAz ? moonriseAz.deg : null,
            moonriseDir: moonriseAz ? moonriseAz.dir : null,
            moonsetAzimuth: moonsetAz ? moonsetAz.deg : null,
            moonsetDir: moonsetAz ? moonsetAz.dir : null,
            distance: moonDistance.toFixed(2) + ' meters',
            distanceKm: Math.round(moonDistance),
            huntStar: huntStar,
            meridianTimesAvailable: (oneHourBeforeMeridian && oneHourAfterMeridian) ? true : false,
        });
    }

    // ===== หาจุดใกล้/ไกลโลกของเดือน + ตรวจ Supermoon/Micromoon =====
    if (result.length) {
        const dists = result.map((r) => r.distanceKm);
        const minD = Math.min(...dists), maxD = Math.max(...dists);
        // วันเพ็ญของเดือน = วันที่แสงสว่างมากที่สุด
        let fullIdx = 0;
        result.forEach((r, i) => {
            if (parseFloat(r.illumination) > parseFloat(result[fullIdx].illumination)) fullIdx = i;
        });
        result.forEach((r) => {
            r.isPerigee = r.distanceKm === minD;  // ใกล้โลกสุดของเดือน
            r.isApogee = r.distanceKm === maxD;   // ไกลโลกสุดของเดือน
            r.supermoon = false;
            r.micromoon = false;
        });
        // ติดธงเฉพาะ "วันเพ็ญของเดือน" ถ้าเป็นเพ็ญจริงและใกล้/ไกลสุดของเดือน
        const f = result[fullIdx];
        if (parseFloat(f.illumination) >= 97) {
            if (f.distanceKm <= minD + 3000) f.supermoon = true;       // เพ็ญตรงกับช่วงใกล้โลก
            else if (f.distanceKm >= maxD - 3000) f.micromoon = true;  // เพ็ญตรงกับช่วงไกลโลก
        }
    }

    res.json(result);
});

// ── /api/sky — ท้องฟ้าดูดาวตามพิกัด GPS ──
// ดาวเคราะห์ที่เห็นคืนนี้ (ถ้าไม่ส่ง date = คืนนี้) + ดาวเคียงเดือน + อุปราคาครั้งหน้า
// GET /api/sky?location=lat,lng[&date=YYYY-MM-DD]
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

// แปลง azimuth (เรเดียน, SunCalc วัดจากทิศใต้ตามเข็ม) → ทิศเข็มทิศ (0=N) + ชื่อทิศ 16 จุด
function azimuthInfo(azRad) {
    let deg = (azRad * 180 / Math.PI + 180) % 360;
    if (deg < 0) deg += 360;
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return { deg: Math.round(deg), dir: dirs[Math.round(deg / 22.5) % 16] };
}

// ชื่อเฟสดวงจันทร์จากค่า phase (0=ดับ, 0.25=ขึ้นครึ่งดวง, 0.5=เพ็ญ, 0.75=แรมครึ่งดวง)
function phaseName(phase) {
    const p = ((phase % 1) + 1) % 1; // normalize 0..1
    if (p < 0.03 || p > 0.97) return 'จันทร์ดับ';
    if (p < 0.22) return 'ข้างขึ้น เสี้ยว';
    if (p < 0.28) return 'ข้างขึ้น ครึ่งดวง';
    if (p < 0.47) return 'ข้างขึ้น ค่อนดวง';
    if (p < 0.53) return 'จันทร์เพ็ญ';
    if (p < 0.72) return 'ข้างแรม ค่อนดวง';
    if (p < 0.78) return 'ข้างแรม ครึ่งดวง';
    return 'ข้างแรม เสี้ยว';
}

// ช่วง "ฟ้ามืดจริง" สำหรับดูดาว = กลางคืนดาราศาสตร์ (ดวงอาทิตย์ต่ำกว่า -18°)
// ที่ดวงจันทร์อยู่ใต้ขอบฟ้าด้วย → คืนช่วงต่อเนื่องที่ยาวที่สุด
function computeDarkWindow(date, lat, lng) {
    const tonight = SunCalc.getTimes(date, lat, lng);
    const tomorrow = SunCalc.getTimes(new Date(date.getTime() + 24 * 60 * 60 * 1000), lat, lng);
    const nightStart = tonight.night;     // พลบค่ำดาราศาสตร์ (คืนนี้)
    const nightEnd = tomorrow.nightEnd;   // รุ่งสางดาราศาสตร์ (เช้าพรุ่งนี้)
    if (!nightStart || !nightEnd || isNaN(nightStart.getTime()) || isNaN(nightEnd.getTime()) || nightEnd <= nightStart) {
        return { start: null, end: null, ms: 0 }; // ไม่มีคืนมืดสนิท (เช่น แถบขั้วโลกหน้าร้อน)
    }
    const step = 5 * 60 * 1000; // สุ่มทุก 5 นาที
    let curStart = null, bestStart = null, bestEnd = null, bestLen = 0;
    for (let t = nightStart.getTime(); t <= nightEnd.getTime(); t += step) {
        const alt = SunCalc.getMoonPosition(new Date(t), lat, lng).altitude; // เรเดียน, < 0 = ใต้ขอบฟ้า
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
    if (bestStart === null) return { start: null, end: null, ms: 0 }; // จันทร์อยู่บนฟ้าทั้งคืน
    return { start: new Date(bestStart), end: new Date(bestEnd), ms: bestLen };
}

// แก้บั๊ก #1 (ฉบับถูกต้องตามความหมาย Solunar):
// เทียบแบบ "เวลาในรอบวัน" (clock-time) เพราะ Solunar นับช่วงจันทร์เหนือหัว (เมอริเดียน)
// และจันทร์ใต้เท้า (เมอริเดียนตรงข้าม = +12ชม.) ว่าเป็นของ "วันเดียวกัน"
// พร้อมรองรับช่วงที่คร่อมเที่ยงคืน (บั๊กเดิม: เมื่อ start>end จะคืน false เสมอ)
// หมายเหตุ: ผลลัพธ์ไม่ขึ้นกับ timezone ของเครื่อง (เป็นการเช็กสมาชิกบนวงกลม 24 ชม.)
function isTimeBetween(timeToCheck, startTime, endTime) {
    if (!timeToCheck || !startTime || !endTime) return false;
    const m = (d) => d.getHours() * 60 + d.getMinutes();
    const t = m(timeToCheck), s = m(startTime), e = m(endTime);
    return s <= e ? (t >= s && t <= e) : (t >= s || t <= e);
}