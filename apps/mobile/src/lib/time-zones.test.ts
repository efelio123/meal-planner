import { deviceTimeZone, supportedTimeZones, timeZoneLabel } from '@/lib/time-zones';

describe('deviceTimeZone', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the time zone reported by the device', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: 'Pacific/Auckland' }),
    }) as Intl.DateTimeFormat);

    expect(deviceTimeZone()).toBe('Pacific/Auckland');
  });

  it('falls back to UTC when the device cannot report a time zone', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl is unavailable');
    });

    expect(deviceTimeZone()).toBe('UTC');
  });

  it('creates a readable label without changing the submitted IANA value', () => {
    expect(timeZoneLabel('America/Los_Angeles')).toContain('Los Angeles');
  });

  it('uses bundled zones when Intl.supportedValuesOf is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'supportedValuesOf');
    Object.defineProperty(Intl, 'supportedValuesOf', { configurable: true, value: undefined });

    try {
      const zones = supportedTimeZones();
      expect(zones).toEqual(expect.arrayContaining(['America/New_York', 'Europe/London', 'Asia/Tokyo', 'UTC']));
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'supportedValuesOf', descriptor);
      else {
        const mutableIntl = Intl as unknown as { supportedValuesOf?: unknown };
        delete mutableIntl.supportedValuesOf;
      }
    }
  });
});
