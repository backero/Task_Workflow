/* eslint-env jest */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock'),
);

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  stopObserving: jest.fn(),
  requestAuthorization: jest.fn(),
  setRNConfiguration: jest.fn(),
}));

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(),
  isVisible: jest.fn(),
  useHideAnimation: jest.fn().mockReturnValue({
    container: {},
    logo: {source: 0},
    brand: {source: 0},
  }),
}));

// Reanimated's own `mock.js` re-exports `src/index` (the native entry),
// which triggers `initializeReanimatedModule` -> `setCSSEventHandler` and
// crashes under the RN jest preset. Only a few APIs are used by app code
// (src/components/snackbar), so provide a minimal standalone mock instead.
jest.mock('react-native-reanimated', () => {
  const {View} = require('react-native');
  const makeSharedValue = init => {
    let value = init;
    return {
      get value() {
        return value;
      },
      set value(next) {
        value = next;
      },
      set: next => {
        value = next;
      },
      get: () => value,
    };
  };
  const finish = callback => {
    if (typeof callback === 'function') {
      callback(true);
    }
  };
  return {
    __esModule: true,
    default: {View},
    Animated: {View},
    useSharedValue: init => makeSharedValue(init),
    useDerivedValue: fn => makeSharedValue(fn()),
    useAnimatedStyle: fn => fn(),
    withTiming: (toValue, _config, callback) => {
      finish(callback);
      return toValue;
    },
    withSpring: (toValue, _config, callback) => {
      finish(callback);
      return toValue;
    },
    runOnJS: fn => fn,
    cancelAnimation: () => {},
    Easing: {out: fn => fn, in: fn => fn, linear: t => t},
  };
});
