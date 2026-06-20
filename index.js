require('dotenv').config();
const express = require('express');
const SunCalc = require('suncalc');
const tzlookup = require('tz-lookup'); // หา timezone จากพิกัด GPS (ออฟไลน์)
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
        const moonPosition = SunCalc.getMoonPosition(date, lat, lng);
        const moonDistance = moonPosition.distance;
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
        const fmt = (d) => d ? d.toLocaleString('en-US',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}) : null;
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
            distance: moonDistance.toFixed(2) + ' meters',
            huntStar: huntStar,
            meridianTimesAvailable: (oneHourBeforeMeridian && oneHourAfterMeridian) ? true : false,
        });
    }
    res.json(result);
});

app.listen(port, () => { console.log(`Server running at http://localhost:${port}`); });

// แก้บั๊ก #1: เทียบด้วย Date timestamp ตรง ๆ (ไม่แปลงเป็นสตริง "HH:MM")
// → รองรับช่วงเวลาที่คร่อมเที่ยงคืนและอยู่คนละวันได้ถูกต้อง
// → คืน false อัตโนมัติเมื่อมีค่าเป็น null (เช่น วันที่จันทร์ไม่ขึ้น/ไม่ตก) จึงไม่ต้องมี guard ภายนอก
function isTimeBetween(timeToCheck, startTime, endTime) {
    if (!timeToCheck || !startTime || !endTime) return false;
    const t = timeToCheck.getTime();
    return t >= startTime.getTime() && t <= endTime.getTime();
}
