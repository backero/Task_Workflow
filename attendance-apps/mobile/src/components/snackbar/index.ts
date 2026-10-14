import {snackbarStore, type SnackbarOptions} from './store';
import {neutral, surface} from '../../theme/palette';

export const LENGTH_SHORT = 3000;
export const LENGTH_LONG = 5000;
export const LENGTH_INDEFINITE = Number.MAX_SAFE_INTEGER;

const show = (options: SnackbarOptions): void => {
  snackbarStore.show({
    backgroundColor: neutral[900],
    textColor: surface,
    ...options,
  });
};

const dismiss = (): void => {
  snackbarStore.hide();
};

export const Snackbar = {
  LENGTH_SHORT,
  LENGTH_LONG,
  LENGTH_INDEFINITE,
  show,
  dismiss,
};

export type {SnackbarAction, SnackbarOptions} from './store';
