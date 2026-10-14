export interface SnackbarAction {
  text: string;
  textColor?: string;
  onPress?: () => void;
}

export interface SnackbarOptions {
  text: string;
  textColor?: string;
  backgroundColor?: string;
  /** Auto-dismiss delay in milliseconds. */
  duration?: number;
  /** Extra space in points added below the snackbar (e.g. above a tab bar). */
  marginBottom?: number;
  /** Show a spinner instead of the close button on the trailing edge. */
  loading?: boolean;
  action?: SnackbarAction;
}

type Listener = (options: SnackbarOptions | null) => void;

let activeListener: Listener | null = null;
let currentOptions: SnackbarOptions | null = null;

export const snackbarStore = {
  subscribe(listener: Listener): () => void {
    activeListener = listener;
    return () => {
      if (activeListener === listener) {
        activeListener = null;
      }
    };
  },

  getCurrent(): SnackbarOptions | null {
    return currentOptions;
  },

  show(options: SnackbarOptions): void {
    currentOptions = options;
    activeListener?.(options);
  },

  hide(): void {
    currentOptions = null;
    activeListener?.(null);
  },
};
