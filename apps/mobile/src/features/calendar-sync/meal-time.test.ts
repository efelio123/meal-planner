import { parseMealTime } from './meal-time';
it.each([['8:00 AM', '08:00'], ['12:00 am', '00:00'], ['12:30 PM', '12:30'], ['6:15 pm', '18:15'], ['23:59', '23:59'], ['00:00', '00:00']])('accepts %s', (input, expected) => expect(parseMealTime(input)).toBe(expected));
it.each(['24:00', '13:00 PM', '12:60', '0:30 am', '8', '', '8:3', 'not a time'])('rejects %s', (input) => expect(parseMealTime(input)).toBeNull());
