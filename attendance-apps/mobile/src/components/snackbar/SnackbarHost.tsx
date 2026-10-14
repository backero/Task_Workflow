import {X} from 'lucide-react-native';
import React, {useCallback, useEffect, useReducer, useRef} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {snackbarStore, type SnackbarOptions} from './store';
import {neutral, spacing, surface} from '../../theme/palette';

const HIDE_DURATION_MS = 200;
const DEFAULT_DURATION_MS = 2000;
const SIDE_INSET = spacing.md;

export default function SnackbarHost(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const barHeight = useSharedValue(0);
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);
  const optionsRef = useRef<SnackbarOptions | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const animateOut = useCallback(() => {
    cancelTimer();
    progress.value = withTiming(0, {duration: HIDE_DURATION_MS});
  }, [cancelTimer, progress]);

  const startHideTimer = useCallback(
    (duration?: number) => {
      cancelTimer();
      const delay = typeof duration === 'number' && duration > 0 ? duration : DEFAULT_DURATION_MS;
      hideTimer.current = setTimeout(() => {
        hideTimer.current = null;
        progress.value = withTiming(0, {duration: HIDE_DURATION_MS});
      }, delay);
    },
    [cancelTimer, progress],
  );

  useEffect(() => {
    const unsubscribe = snackbarStore.subscribe(options => {
      if (options) {
        optionsRef.current = options;
        forceUpdate();
        if (options.loading) {
          progress.value = withSpring(1, {damping: 18, stiffness: 150});
        } else {
          progress.value = withSpring(1, {damping: 18, stiffness: 150}, finished => {
            'worklet';
            if (finished) {
              runOnJS(startHideTimer)(options.duration);
            }
          });
        }
      } else {
        animateOut();
      }
    });
    return () => {
      unsubscribe();
      cancelTimer();
    };
  }, [animateOut, cancelTimer, progress, startHideTimer]);

  const dismiss = useCallback(() => {
    animateOut();
  }, [animateOut]);

  const animatedStyle = useAnimatedStyle(() => {
    const offset = (1 - progress.value) * barHeight.value;
    return {
      opacity: progress.value,
      transform: [{translateY: offset}],
    };
  });

  const options = optionsRef.current;

  if (!options) {
    return <Animated.View pointerEvents="none" style={styles.invisible} />;
  }

  const marginBottom = insets.bottom + (options.marginBottom ?? spacing.md);
  const backgroundColor = options.backgroundColor ?? neutral[900];
  const textColor = options.textColor ?? surface;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrapper, {paddingBottom: marginBottom}, animatedStyle]}
    >
      <Animated.View
        onLayout={({nativeEvent}) => {
          barHeight.value = nativeEvent.layout.height;
        }}
        style={[styles.toast, {backgroundColor}]}
      >
        <Text style={[styles.text, {color: textColor}]}>{options.text}</Text>
        {options.loading ? (
          <ActivityIndicator size="small" color={textColor} style={styles.trailing} />
        ) : (
          <TouchableOpacity onPress={dismiss} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <X color={textColor} size={20} style={styles.trailing} />
          </TouchableOpacity>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  invisible: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  wrapper: {
    position: 'absolute',
    left: SIDE_INSET,
    right: SIDE_INSET,
    bottom: 0,
  },
  toast: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.sm,
    shadowColor: neutral[900],
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  trailing: {
    marginLeft: spacing.md,
  },
});
