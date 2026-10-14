import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming} from 'react-native-reanimated';

import {neutral, primary, surface, typography} from '../theme/palette';

const THUMB_SIZE = 52;
const TRACK_PADDING = 4;
const COMPLETE_THRESHOLD = 0.72;

interface SwipeToPunchProps {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onComplete: () => void;
}

/** Lock-screen-style swipe gesture for logging attendance. Drag the thumb to
 * the end of the track to fire `onComplete`; released early, it springs
 * back. Uses react-native-gesture-handler's Pan gesture + Reanimated
 * worklets (both already installed) rather than the legacy PanResponder. */
export default function SwipeToPunch({label, loading, disabled, onComplete}: SwipeToPunchProps): React.JSX.Element {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const maxTranslate = Math.max(trackWidth - THUMB_SIZE - TRACK_PADDING * 2, 1);

  const fire = useCallback(() => {
    if (!disabled && !loading) onComplete();
  }, [disabled, loading, onComplete]);

  const gesture = Gesture.Pan()
    .enabled(!disabled && !loading)
    .onChange(event => {
      'worklet';
      const next = translateX.value + event.changeX;
      translateX.value = Math.min(Math.max(next, 0), maxTranslate);
    })
    .onEnd(() => {
      'worklet';
      if (translateX.value >= maxTranslate * COMPLETE_THRESHOLD) {
        translateX.value = withTiming(maxTranslate, {duration: 150});
        runOnJS(fire)();
      } else {
        translateX.value = withSpring(0, {damping: 18, stiffness: 180});
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{translateX: translateX.value}],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value + THUMB_SIZE,
  }));

  // Reset the thumb once a punch completes and the parent re-renders with a
  // new `label` (Check In -> Check Out) or after a failed attempt clears loading.
  useEffect(() => {
    if (!loading) translateX.value = withSpring(0, {damping: 18, stiffness: 180});
  }, [label, loading, translateX]);

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled]}
      onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.fill, fillStyle]} />
      <Text style={styles.label} pointerEvents="none">
        {loading ? 'Logging…' : disabled ? 'Already completed today' : `Swipe to ${label}`}
      </Text>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.thumb, thumbStyle, disabled && styles.thumbDisabled]}>
          <Text style={styles.thumbArrow}>›</Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB_SIZE + TRACK_PADDING * 2,
    borderRadius: (THUMB_SIZE + TRACK_PADDING * 2) / 2,
    backgroundColor: neutral[100],
    borderWidth: 1,
    borderColor: neutral[200],
    justifyContent: 'center',
    overflow: 'hidden',
    padding: TRACK_PADDING,
  },
  trackDisabled: {backgroundColor: neutral[50]},
  fill: {
    position: 'absolute',
    left: TRACK_PADDING,
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: primary.base,
  },
  label: {
    textAlign: 'center',
    fontSize: typography.scale.body.size,
    fontWeight: typography.weight.medium as '500',
    color: neutral[600],
  },
  thumb: {
    position: 'absolute',
    left: TRACK_PADDING,
    top: TRACK_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: primary.active,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDisabled: {backgroundColor: neutral[300]},
  thumbArrow: {
    color: surface,
    fontSize: 24,
    fontWeight: typography.weight.semibold as '600',
    marginLeft: 2,
  },
});
