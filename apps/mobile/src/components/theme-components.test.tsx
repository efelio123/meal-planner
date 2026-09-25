import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Screen } from './screen';
import { TimeZonePicker, timeZoneModalStyle } from './time-zone-picker';

let mockMode: 'light' | 'dark' = 'light';

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockMode,
}));

describe.each([
  ['light', '#ffffff', '#ffffff'],
  ['dark', '#101114', '#1d1e22'],
] as const)('the %s theme', (mode, screenColor, inputColor) => {
  beforeEach(() => { mockMode = mode; });

  it('renders the shared screen with its semantic background', async () => {
    const component = await render(<Screen><Text>Content</Text></Screen>);
    expect(component.getByTestId('screen').props.style).toMatchObject({ backgroundColor: screenColor });
  });

  it('renders the time-zone picker and derives its modal background from the same theme', async () => {
    const component = await render(<TimeZonePicker onChange={jest.fn()} value="America/Phoenix" />);
    expect(component.getByLabelText('Time zone').props.style[1]).toMatchObject({ backgroundColor: inputColor });
    expect(timeZoneModalStyle(screenColor)).toContainEqual({ backgroundColor: screenColor });
  });
});
