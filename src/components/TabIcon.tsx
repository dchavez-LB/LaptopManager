import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  focused: boolean;
  color: string;
  size: number;
  iconName: keyof typeof Ionicons.glyphMap;
  dotColor: string;
}

export default function TabIcon({ focused, color, size, iconName, dotColor }: Props) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const opacity = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: focused ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: focused ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      })
    ]).start();
  }, [focused]);

  return (
    <View style={{ alignItems: 'center' }}>
      <Ionicons name={iconName} size={size} color={color} />
      <Animated.View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: dotColor,
          marginTop: 4,
          opacity,
          transform: [{ scale }]
        }}
      />
    </View>
  );
}