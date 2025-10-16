import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View, Platform } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useNavigation, useNavigationState, useIsFocused } from '@react-navigation/native';

interface Props {
  children: React.ReactNode;
  prev?: React.ReactNode;
  next?: React.ReactNode;
  disableSwipeLeft?: boolean;  // bloquear ir hacia la izquierda (mostrar next)
  disableSwipeRight?: boolean; // bloquear ir hacia la derecha (mostrar prev)
}

export default function SwipeableTabScreen({ children, prev, next, disableSwipeLeft, disableSwipeRight }: Props) {
  const navigation = useNavigation();
  const routes = useNavigationState((s) => s.routes);
  const index = useNavigationState((s) => s.index);
  const isFocused = useIsFocused();

  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const screenWidth = Dimensions.get('window').width;
  const maxDrag = Math.min(120, screenWidth * 0.3);

  const nextOpacity = translateX.interpolate({
    inputRange: [-maxDrag, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });
  const prevOpacity = translateX.interpolate({
    inputRange: [0, maxDrag],
    outputRange: [0, 1],
    extrapolate: 'clamp'
  });

  useEffect(() => {
    if (isFocused) {
      // pequeña entrada sutil
      translateX.setValue(10);
      opacity.setValue(0.95);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [isFocused]);

  const onGestureEvent = (evt: any) => {
    const dx = evt?.nativeEvent?.translationX ?? 0;
    let clamped = Math.max(-maxDrag, Math.min(maxDrag, dx));
    if (disableSwipeLeft && clamped < 0) clamped = 0;
    if (disableSwipeRight && clamped > 0) clamped = 0;
    translateX.setValue(clamped);
    const ratio = Math.min(1, Math.abs(clamped) / maxDrag);
    opacity.setValue(1 - ratio * 0.1);
  };

  const onHandlerStateChange = (evt: any) => {
    const { state, translationX, velocityX } = evt.nativeEvent || {};
    if (state === State.END) {
      const threshold = Math.min(50, screenWidth * 0.14);
      const fast = Math.abs(velocityX) > 300;
      // Swipe left -> siguiente pestaña
      if (translationX < -threshold && fast && !disableSwipeLeft) {
        if (index < routes.length - 1) {
          Animated.parallel([
            Animated.timing(translateX, { toValue: -maxDrag, duration: 140, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.9, duration: 140, useNativeDriver: true })
          ]).start(() => {
            // @ts-ignore
            navigation.navigate(routes[index + 1].name);
            // reset para la siguiente pantalla
            translateX.setValue(0);
            opacity.setValue(1);
          });
        }
      }
      // Swipe right -> pestaña anterior
      else if (translationX > threshold && fast && !disableSwipeRight) {
        if (index > 0) {
          Animated.parallel([
            Animated.timing(translateX, { toValue: maxDrag, duration: 140, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.9, duration: 140, useNativeDriver: true })
          ]).start(() => {
            // @ts-ignore
            navigation.navigate(routes[index - 1].name);
            translateX.setValue(0);
            opacity.setValue(1);
          });
        }
      }
      // No se alcanzó el umbral: volver a posición
      else {
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true })
        ]).start();
      }
    }
  };

  // En web, los gestures pueden interferir con onPress dentro de la pantalla.
  // Dado que el foco principal es móvil, deshabilitamos el PanGesture en web
  // para evitar conflictos de taps, manteniendo intacto el comportamiento en móvil.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {prev && (
          <Animated.View
            pointerEvents="none"
            style={[styles.peek, { left: -screenWidth, opacity: prevOpacity, transform: [{ translateX }] }]}
          >
            {prev}
          </Animated.View>
        )}
        <Animated.View style={[styles.current, { opacity, transform: [{ translateX }] }]}> 
          {children}
        </Animated.View>
        {next && (
          <Animated.View
            pointerEvents="none"
            style={[styles.peek, { left: screenWidth, opacity: nextOpacity, transform: [{ translateX }] }]}
          >
            {next}
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      activeOffsetX={[-25, 25]}
      failOffsetY={[-15, 15]}
    >
      <View style={styles.container}>
        {prev && (
          <Animated.View
            pointerEvents="none"
            style={[styles.peek, { left: -screenWidth, opacity: prevOpacity, transform: [{ translateX }] }]}
          >
            {prev}
          </Animated.View>
        )}
        <Animated.View style={[styles.current, { opacity, transform: [{ translateX }] }]}> 
          {children}
        </Animated.View>
        {next && (
          <Animated.View
            pointerEvents="none"
            style={[styles.peek, { left: screenWidth, opacity: nextOpacity, transform: [{ translateX }] }]}
          >
            {next}
          </Animated.View>
        )}
      </View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative', overflow: 'hidden' },
  current: { flex: 1 },
  peek: { position: 'absolute', top: 0, width: '100%', height: '100%' }
});