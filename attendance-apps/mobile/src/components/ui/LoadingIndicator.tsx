import LottieView from 'lottie-react-native';
import React from 'react';
import {View} from 'react-native';

import loaderAnimation from '../../assets/loader.json';

interface LoadingIndicatorProps {
  size?: number;
}

/** The screen-level loading state — a looping brand-orange ring, replacing
 * the plain platform ActivityIndicator on every screen's initial-load state.
 * Inline loading (a button's own spinner, a toast's trailing indicator)
 * stays as ActivityIndicator — a full animation there would read as
 * oversized rather than as a loading cue. */
export default function LoadingIndicator({size = 64}: LoadingIndicatorProps): React.JSX.Element {
  return (
    <View style={{width: size, height: size}}>
      <LottieView source={loaderAnimation} autoPlay loop style={{width: size, height: size}} />
    </View>
  );
}
