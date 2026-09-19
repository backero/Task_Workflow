/**
 * Phase 5 DoD: "app-level error boundary tested (simulated crash shows
 * 'something went wrong,' not a white screen)".
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import AppErrorBoundary from '../src/components/AppErrorBoundary';

function ThrowsOnRender(): React.JSX.Element {
  throw new Error('simulated crash');
}

describe('AppErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppErrorBoundary>
          <React.Fragment>{'ok'}</React.Fragment>
        </AppErrorBoundary>,
      );
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('shows the fallback UI instead of a white screen when a child throws', () => {
    // React logs the caught error to the console during this render; that's
    // expected test noise, not a real unhandled crash.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    let tree: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <AppErrorBoundary>
          <ThrowsOnRender />
        </AppErrorBoundary>,
      );
    });

    const renderedText = JSON.stringify(tree!.toJSON());
    expect(renderedText).toContain('Something went wrong');
    expect(renderedText).not.toBe('null'); // never a blank/white screen

    consoleErrorSpy.mockRestore();
  });
});
