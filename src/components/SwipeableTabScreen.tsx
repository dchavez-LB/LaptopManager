import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../utils/colors';
// import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useNavigation, useNavigationState } from '@react-navigation/native';

interface Props {
  children: React.ReactNode;
  prev?: React.ReactNode;
  next?: React.ReactNode;
  disableSwipeLeft?: boolean;  // bloquear ir hacia la izquierda (mostrar next)
  disableSwipeRight?: boolean; // bloquear ir hacia la derecha (mostrar prev)
}

export default function SwipeableTabScreen({ children, disableSwipeLeft, disableSwipeRight }: Props) {
  const navigation = useNavigation();
  const routes = useNavigationState((s) => s.routes);
  const index = useNavigationState((s) => s.index);

  const onHandlerStateChange = (evt: any) => {
    const { state, translationX, velocityX } = evt.nativeEvent || {};
    if (state === State.END) {
      const threshold = 50;
      const fast = Math.abs(velocityX) > 350;
      // Swipe left -> siguiente pestaña
      if (translationX < -threshold && !disableSwipeLeft && (fast || Math.abs(translationX) > threshold)) {
        if (index < routes.length - 1) {
          // @ts-ignore
          navigation.navigate(routes[index + 1].name);
        }
      }
      // Swipe right -> pestaña anterior
      else if (translationX > threshold && !disableSwipeRight && (fast || Math.abs(translationX) > threshold)) {
        if (index > 0) {
          // @ts-ignore
          navigation.navigate(routes[index - 1].name);
        }
      }
    }
  };

  return (
    <View style={styles.container}>{children}</View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }
});