import React from 'react';
import {Image, StyleSheet, type ImageStyle, type StyleProp} from 'react-native';

// Source: D:\Backero.png, provided by Backero (see docs/architecture — spec
// §26 brand identity). 4200x1800 native — a fixed aspect ratio is set below
// rather than letting flexbox stretch it.
const LOGO_ASPECT_RATIO = 4200 / 1800;

export default function Logo({
  width = 220,
  style,
}: {
  width?: number;
  style?: StyleProp<ImageStyle>;
}): React.JSX.Element {
  return (
    <Image
      source={require('../assets/backero-logo.png')}
      style={[{width, height: width / LOGO_ASPECT_RATIO}, styles.image, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Backero"
    />
  );
}

const styles = StyleSheet.create({
  image: {alignSelf: 'center'},
});
