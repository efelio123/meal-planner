import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { RecipeCover } from './recipe-cover';

describe('Recipe cover presentation', () => {
  it('gives hero initials a line height that prevents glyph clipping', async () => {
    const view = await render(<RecipeCover recipe={{ name: 'Chicken Tacos', cover_kind: 'initials', cover_emoji: null }} size="hero" />);
    const label = view.getByLabelText('Recipe initials C T');
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({ fontSize: 48, lineHeight: 60 });
  });

  it('scales selected emojis for hero and thumbnail covers', async () => {
    const view = await render(<RecipeCover recipe={{ name: 'Soup', cover_kind: 'emoji', cover_emoji: '🍲' }} size="hero" />);
    expect(StyleSheet.flatten(view.getByLabelText('Recipe cover 🍲').props.style)).toMatchObject({ fontSize: 72, lineHeight: 84 });

    await view.rerender(<RecipeCover recipe={{ name: 'Soup', cover_kind: 'emoji', cover_emoji: '🍲' }} size="row" />);
    expect(StyleSheet.flatten(view.getByLabelText('Recipe cover 🍲').props.style)).toMatchObject({ fontSize: 28, lineHeight: 34 });
  });
});
