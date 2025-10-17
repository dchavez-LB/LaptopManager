import React, { createContext, useContext, useMemo, useState } from 'react';

interface SwipeContextValue {
  swipeEnabled: boolean;
  enableSwipe: () => void;
  disableSwipe: () => void;
}

const SwipeContext = createContext<SwipeContextValue>({
  swipeEnabled: true,
  enableSwipe: () => {},
  disableSwipe: () => {},
});

export function SwipeProvider({ children }: { children: React.ReactNode }) {
  const [swipeEnabled, setSwipeEnabled] = useState(true);

  const value = useMemo(
    () => ({
      swipeEnabled,
      enableSwipe: () => setSwipeEnabled(true),
      disableSwipe: () => setSwipeEnabled(false),
    }),
    [swipeEnabled]
  );

  return <SwipeContext.Provider value={value}>{children}</SwipeContext.Provider>;
}

export function useSwipe() {
  return useContext(SwipeContext);
}