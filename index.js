require('dotenv').config();
const express = require('express');
const SunCalc = require('suncalc');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON request body (if needed)
app.use(express.json());

// Route to get moonrise, moonset, illumination, distance, meridian passing times, opposite meridian passing, sunrise/sunset times, and times around moonrise and moonset
app.get('/api/moon-times', (req, res) => {
    const { latitude, longitude, year, month } = req.query;

    // Validate input parameters
    if (!latitude || !longitude || !year || !month) {
        return res.status(400).json({ error: 'Latitude, Longitude, Year, and Month are required.' });
    }

    // Convert the month to an integer and check for valid values
    const monthInt = parseInt(month, 10);
    if (monthInt < 1 || monthInt > 12) {
        return res.status(400).json({ error: 'Invalid month. It must be between 1 and 12.' });
    }

    // Convert year to integer
    const yearInt = parseInt(year, 10);

    // Prepare date object for the first day of the given month and year
    let date = new Date(yearInt, monthInt - 1, 1); // month is 0-indexed in JavaScript

    // Get the number of days in the given month
    const daysInMonth = new Date(yearInt, monthInt, 0).getDate(); // Get the number of days in the month

    const result = [];

    // Loop through each day of the month and calculate moonrise, moonset, sunrise, sunset, and meridian passing times
    for (let day = 1; day <= daysInMonth; day++) {
        date.setDate(day); // Set the current day

        // Get moonrise and moonset times using SunCalc
        const moonTimes = SunCalc.getMoonTimes(date, parseFloat(latitude), parseFloat(longitude));

        // Get sunrise and sunset times using SunCalc
        const sunTimes = SunCalc.getTimes(date, parseFloat(latitude), parseFloat(longitude));

        // Calculate meridian passing (approximate midpoint between moonrise and moonset)
        let meridianPassing = null;
        if (moonTimes.rise && moonTimes.set) {
            meridianPassing = new Date((moonTimes.rise.getTime() + moonTimes.set.getTime()) / 2);
        }

        // Calculate the opposite meridian passing (12 hours later)
        let oppositeMeridianPassing = null;
        if (meridianPassing) {
            oppositeMeridianPassing = new Date(meridianPassing.getTime() + 12 * 60 * 60 * 1000); // 12 hours later
        }

        // Get the moon illumination and phase
        const illumination = SunCalc.getMoonIllumination(date);
        const moonIllumination = illumination.fraction * 100; // Fraction as percentage

        // Get the distance between Earth and the Moon
        const moonPosition = SunCalc.getMoonPosition(date, parseFloat(latitude), parseFloat(longitude));
        const moonDistance = moonPosition.distance; // Distance in meters

        // Format the date as yyyy/mm/dd
        const formattedDate = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

        // Format the times in 24-hour format using toLocaleString with options
        const moonrise = moonTimes.rise
            ? moonTimes.rise.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;
        const moonset = moonTimes.set
            ? moonTimes.set.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;
        const meridianTime = meridianPassing
            ? meridianPassing.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;
        const oppositeMeridianTime = oppositeMeridianPassing
            ? oppositeMeridianPassing.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;
        
        const sunrise = sunTimes.sunrise
            ? sunTimes.sunrise.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;
        
        const sunset = sunTimes.sunset
            ? sunTimes.sunset.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        const solarNoon = sunTimes.solarNoon
            ? sunTimes.solarNoon.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        // **Daylength Calculation in hh:mm:ss format**:
        let daylength = null;
        if (sunTimes.sunrise && sunTimes.sunset) {
            const dayStart = sunTimes.sunrise.getTime();
            const dayEnd = sunTimes.sunset.getTime();
            const dayLengthInMs = dayEnd - dayStart;

            // Convert milliseconds to hours, minutes, and seconds
            const dayLengthInSeconds = Math.floor(dayLengthInMs / 1000); // Convert to seconds
            const hours = Math.floor(dayLengthInSeconds / 3600); // Get hours
            const minutes = Math.floor((dayLengthInSeconds % 3600) / 60); // Get minutes
            const seconds = dayLengthInSeconds % 60; // Get seconds

            daylength = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        // Calculate 30 minutes before and 30 minutes after moonrise
        let thirtyMinutesBeforeMoonrise = null;
        let thirtyMinutesAfterMoonrise = null;
        if (moonTimes.rise) {
            thirtyMinutesBeforeMoonrise = new Date(moonTimes.rise.getTime() - 30 * 60 * 1000); // 30 minutes before
            thirtyMinutesAfterMoonrise = new Date(moonTimes.rise.getTime() + 30 * 60 * 1000); // 30 minutes after
        }

        const formattedThirtyMinutesBeforeMoonrise = thirtyMinutesBeforeMoonrise
            ? thirtyMinutesBeforeMoonrise.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        const formattedThirtyMinutesAfterMoonrise = thirtyMinutesAfterMoonrise
            ? thirtyMinutesAfterMoonrise.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        // Calculate 30 minutes before and 30 minutes after moonset
        let thirtyMinutesBeforeMoonset = null;
        let thirtyMinutesAfterMoonset = null;
        if (moonTimes.set) {
            thirtyMinutesBeforeMoonset = new Date(moonTimes.set.getTime() - 30 * 60 * 1000); // 30 minutes before
            thirtyMinutesAfterMoonset = new Date(moonTimes.set.getTime() + 30 * 60 * 1000); // 30 minutes after
        }

        const formattedThirtyMinutesBeforeMoonset = thirtyMinutesBeforeMoonset
            ? thirtyMinutesBeforeMoonset.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        const formattedThirtyMinutesAfterMoonset = thirtyMinutesAfterMoonset
            ? thirtyMinutesAfterMoonset.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        // Calculate 1 hour before and 1 hour after meridian passing
        let oneHourBeforeMeridian = null;
        let oneHourAfterMeridian = null;
        if (meridianPassing) {
            oneHourBeforeMeridian = new Date(meridianPassing.getTime() - 60 * 60 * 1000); // 1 hour before
            oneHourAfterMeridian = new Date(meridianPassing.getTime() + 60 * 60 * 1000); // 1 hour after
        }

        const formattedOneHourBeforeMeridian = oneHourBeforeMeridian
            ? oneHourBeforeMeridian.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        const formattedOneHourAfterMeridian = oneHourAfterMeridian
            ? oneHourAfterMeridian.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        // Calculate 1 hour before and 1 hour after opposite meridian passing
        let oneHourBeforeOppositeMeridian = null;
        let oneHourAfterOppositeMeridian = null;
        if (oppositeMeridianPassing) {
            oneHourBeforeOppositeMeridian = new Date(oppositeMeridianPassing.getTime() - 60 * 60 * 1000); // 1 hour before
            oneHourAfterOppositeMeridian = new Date(oppositeMeridianPassing.getTime() + 60 * 60 * 1000); // 1 hour after
        }

        const formattedOneHourBeforeOppositeMeridian = oneHourBeforeOppositeMeridian
            ? oneHourBeforeOppositeMeridian.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        const formattedOneHourAfterOppositeMeridian = oneHourAfterOppositeMeridian
            ? oneHourAfterOppositeMeridian.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;


        
            
        // Check if sunrise is between one hour before and one hour after meridian
        let huntStar = 0;

        // Calculate 1 Hour before and after sunrise
        let oneHourBeforeSunrise = null;
        let oneHourAfterSunrise = null;
        if (sunTimes.sunrise) {
            oneHourBeforeSunrise = new Date(sunTimes.sunrise.getTime() - 60 * 60 * 1000); // 30 minutes before
            oneHourAfterSunrise = new Date(sunTimes.sunrise.getTime() + 60 * 60 * 1000); // 30 minutes after
        }
        const formattedtoneHourBeforeSunrise = oneHourBeforeSunrise
            ? oneHourBeforeSunrise.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        const formattedtoneHourAfterSunrise = oneHourAfterSunrise
            ? oneHourAfterSunrise.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        // Major Times
        if (oneHourBeforeSunrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourBeforeSunrise, formattedOneHourBeforeMeridian, formattedOneHourAfterMeridian) ? huntStar + 3 : huntStar;
        }       

        if (oneHourAfterSunrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourAfterSunrise, formattedOneHourBeforeMeridian, formattedOneHourAfterMeridian) ? huntStar + 3 : huntStar;
        }

        if (oneHourBeforeSunrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourBeforeSunrise, formattedOneHourBeforeOppositeMeridian, formattedOneHourAfterOppositeMeridian) ? huntStar + 3 : huntStar;
        }       

        if (oneHourAfterSunrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourAfterSunrise, formattedOneHourBeforeOppositeMeridian, formattedOneHourAfterOppositeMeridian) ? huntStar + 3 : huntStar;
        }

        // Minor Times
        if (oneHourBeforeSunrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourBeforeSunrise, formattedThirtyMinutesBeforeMoonrise, formattedThirtyMinutesAfterMoonrise) ? huntStar + 2 : huntStar;
        }       

        if (oneHourAfterSunrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourAfterSunrise, formattedThirtyMinutesBeforeMoonrise, formattedThirtyMinutesAfterMoonrise) ? huntStar + 2 : huntStar;
        }

        if (oneHourBeforeSunrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourBeforeSunrise, formattedThirtyMinutesBeforeMoonset, formattedThirtyMinutesAfterMoonset) ? huntStar + 2 : huntStar;
        }       

        if (oneHourAfterSunrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourAfterSunrise, formattedThirtyMinutesBeforeMoonset, formattedThirtyMinutesAfterMoonset) ? huntStar + 2 : huntStar;
        }



        // Calculate 1 Hour before and after sunset
        let oneHourBeforeSunset = null;
        let oneHourAfterSunset = null;
        if (sunTimes.sunset) {
            oneHourBeforeSunset = new Date(sunTimes.sunset.getTime() - 60 * 60 * 1000); // 30 minutes before
            oneHourAfterSunset = new Date(sunTimes.sunset.getTime() + 60 * 60 * 1000); // 30 minutes after
        }
        const formattedtoneHourBeforeSunset = oneHourBeforeSunset
            ? oneHourBeforeSunset.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        const formattedtoneHourAfterSunset = oneHourAfterSunset
            ? oneHourAfterSunset.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
            : null;

        // Major Times
        if (oneHourBeforeSunset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourBeforeSunset, formattedOneHourBeforeMeridian, formattedOneHourAfterMeridian) ? huntStar + 3 : huntStar;
        }       

        if (oneHourAfterSunset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourAfterSunset, formattedOneHourBeforeMeridian, formattedOneHourAfterMeridian) ? huntStar + 3 : huntStar;
        }

        if (oneHourBeforeSunset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourBeforeSunset, formattedOneHourBeforeOppositeMeridian, formattedOneHourAfterOppositeMeridian) ? huntStar + 3 : huntStar;
        }       

        if (oneHourAfterSunset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourAfterSunset, formattedOneHourBeforeOppositeMeridian, formattedOneHourAfterOppositeMeridian) ? huntStar + 3 : huntStar;
        }

        // Minor Times

        if (oneHourBeforeSunset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourBeforeSunset, formattedThirtyMinutesBeforeMoonrise, formattedThirtyMinutesAfterMoonrise) ? huntStar + 2 : huntStar;
        }       

        if (oneHourAfterSunset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourAfterSunset, formattedThirtyMinutesBeforeMoonrise, formattedThirtyMinutesAfterMoonrise) ? huntStar + 2 : huntStar;
        }

        if (oneHourBeforeSunset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourBeforeSunset, formattedThirtyMinutesBeforeMoonset, formattedThirtyMinutesAfterMoonset) ? huntStar + 2 : huntStar;
        }       

        if (oneHourAfterSunset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(formattedtoneHourAfterSunset, formattedThirtyMinutesBeforeMoonset, formattedThirtyMinutesAfterMoonset) ? huntStar + 2 : huntStar;
        }


        // moonrise and moonset in major and miner time
        // Major Times
        if (moonrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(moonrise, formattedOneHourBeforeMeridian, formattedOneHourAfterMeridian) ? huntStar + 0.5 : huntStar;
        } 
        if (moonset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(moonset, formattedOneHourBeforeMeridian, formattedOneHourAfterMeridian) ? huntStar + 0.5 : huntStar;
        }

        if (moonrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(moonrise, formattedOneHourBeforeOppositeMeridian, formattedOneHourAfterOppositeMeridian) ? huntStar + 0.5 : huntStar;
        }       

        if (moonset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(moonset, formattedOneHourBeforeOppositeMeridian, formattedOneHourAfterOppositeMeridian) ? huntStar + 0.5 : huntStar;
        }

        // Minor Times

        if (moonrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(moonrise, formattedThirtyMinutesBeforeMoonrise, formattedThirtyMinutesAfterMoonrise) ? huntStar + 0.5 : huntStar;
        }       

        if (moonset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(moonset, formattedThirtyMinutesBeforeMoonrise, formattedThirtyMinutesAfterMoonrise) ? huntStar + 0.5 : huntStar;
        }

        if (moonrise && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(moonrise, formattedThirtyMinutesBeforeMoonset, formattedThirtyMinutesAfterMoonset) ? huntStar + 0.5 : huntStar;
        }       

        if (moonset && oneHourBeforeMeridian && oneHourAfterMeridian) {
            huntStar = isTimeBetween(moonset, formattedThirtyMinutesBeforeMoonset, formattedThirtyMinutesAfterMoonset) ? huntStar + 0.5 : huntStar;
        }

        // illumination level
        if (illumination) {
            huntStar = illumination > 0 && illumination <= 10 ? huntStar + 0.5 : huntStar;
        }



            
        
      

        // Prepare the result for the current day
        result.push({
            date: formattedDate, // Use formatted date in yyyy/mm/dd
            moonrise: moonrise,
            moonset: moonset,
            meridianPassing: meridianTime,
            oppositeMeridianPassing: oppositeMeridianTime,
            sunrise: sunrise,
            sunset: sunset,
            solarNoon: solarNoon, 
            daylength: daylength, 
            thirtyMinutesBeforeMoonrise: formattedThirtyMinutesBeforeMoonrise,
            thirtyMinutesAfterMoonrise: formattedThirtyMinutesAfterMoonrise,
            thirtyMinutesBeforeMoonset: formattedThirtyMinutesBeforeMoonset,
            thirtyMinutesAfterMoonset: formattedThirtyMinutesAfterMoonset,
            oneHourBeforeMeridian: formattedOneHourBeforeMeridian,
            oneHourAfterMeridian: formattedOneHourAfterMeridian,
            oneHourBeforeOppositeMeridian: formattedOneHourBeforeOppositeMeridian,
            oneHourAfterOppositeMeridian: formattedOneHourAfterOppositeMeridian,
            illumination: moonIllumination.toFixed(2), // Show illumination as percentage
            distance: moonDistance.toFixed(2) + ' meters', // Show distance in meters

            huntStar: huntStar,
    meridianTimesAvailable: (oneHourBeforeMeridian && oneHourAfterMeridian) ? true : false, // Optional additional info


        });
    }

    // Send the result as JSON
    res.json(result);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

function isTimeBetween(timeToCheck, startTime, endTime) {
    // Function to convert time in "HH:MM" format to minutes since midnight
    const timeToMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };

    // Convert all times to minutes since midnight
    const timeCheck = timeToMinutes(timeToCheck);
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);

    // Check if timeToCheck is between startTime and endTime
    return timeCheck >= start && timeCheck <= end;
}