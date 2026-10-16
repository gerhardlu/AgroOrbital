export const CITIES = Object.freeze([
  { name: 'Jundiaí', latitude: -23.18639, longitude: -46.88417 },
  { name: 'Suzano', latitude: -23.5425, longitude: -46.31083 },
  { name: 'Campinas', latitude: -22.90556, longitude: -47.06083 },
  { name: 'Sorocaba', latitude: -23.50167, longitude: -47.45806 },
].map(Object.freeze))

export const CITY_NAMES = Object.freeze(CITIES.map(city => city.name))
export const DEFAULT_CITY = CITY_NAMES[0]
