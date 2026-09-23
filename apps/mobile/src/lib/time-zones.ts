import { rawTimeZones, timeZonesNames } from '@vvo/tzdb';

const FALLBACK_TIME_ZONE = 'UTC';
const bundledTimeZones = [...new Set([...timeZonesNames, FALLBACK_TIME_ZONE])].sort();

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

export function supportedTimeZones() {
  return bundledTimeZones;
}

export function timeZoneLabel(timeZone: string) {
  const knownTimeZone = rawTimeZones.find((candidate) => (
    candidate.name === timeZone || candidate.group.includes(timeZone)
  ));
  if (knownTimeZone?.mainCities[0]) {
    return `${knownTimeZone.mainCities[0]} — ${knownTimeZone.alternativeName}`;
  }
  const [region, ...placeParts] = timeZone.split('/');
  const place = placeParts.join(' / ').replaceAll('_', ' ');
  return place ? `${place} (${region})` : timeZone;
}

export function filteredTimeZones(selectedTimeZone: string, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [...new Set([...supportedTimeZones(), selectedTimeZone])]
    .sort()
    .filter((timeZone) => {
      if (!normalizedQuery) return true;
      const knownTimeZone = rawTimeZones.find((candidate) => (
        candidate.name === timeZone || candidate.group.includes(timeZone)
      ));
      const searchableText = [
        timeZone,
        timeZoneLabel(timeZone),
        knownTimeZone?.alternativeName,
        ...(knownTimeZone?.mainCities ?? []),
      ].join(' ');
      return searchableText.toLocaleLowerCase().includes(normalizedQuery);
    });
}
