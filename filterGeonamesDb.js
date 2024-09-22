import geonames from './geonames-all-cities-with-a-population-1000.json' with { type: 'json' }
import countries from './public/countries.json' with { type: 'json' }
console.log('cities-initial', geonames.length)
// filter out cities that aren't in countries
let cities = geonames.filter(city => countries.includes(city.country_code))
console.log('cities-supported countries', cities.length)
// filter out cities with under 30000 population
cities = cities.filter(city => city.population > 30000)
console.log('cities-population', cities.length)
// log number of cities in each country
const countryCounts = {}
cities.forEach(city => {
  if (!countryCounts[city.country_code]) {
    countryCounts[city.country_code] = 0
  }
  countryCounts[city.country_code]++
})
console.log('cities-country counts', countryCounts)
// if any country has more than 200 cities, only keep the top 200 populated
Object.keys(countryCounts).forEach(country => {
  if (countryCounts[country] > 200) {
    const countryCities = cities.filter(city => city.country_code === country)
    countryCities.sort((a, b) => b.population - a.population)
    cities = cities.filter(city => city.country_code !== country || countryCities.indexOf(city) < 200)
  }
})
// recount
const newCountryCounts = {}
cities.forEach(city => {
  if (!newCountryCounts[city.country_code]) {
    newCountryCounts[city.country_code] = 0
  }
  newCountryCounts[city.country_code]++
})
console.log('cities-new country counts', newCountryCounts)


// save this to a file ./public/cities.json
import fs from 'fs'
fs.writeFileSync('./public/cities.json', JSON.stringify(cities))
console.log('cities.json written')