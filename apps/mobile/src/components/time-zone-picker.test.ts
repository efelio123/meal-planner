import { submitTimeZoneSelection } from '@/components/time-zone-picker';

describe('TimeZonePicker', () => {
  it('submits the selected IANA time zone when the selection changes', () => {
    const onChange = jest.fn();

    submitTimeZoneSelection(onChange, 'America/Chicago');

    expect(onChange).toHaveBeenCalledWith('America/Chicago');
  });
});
