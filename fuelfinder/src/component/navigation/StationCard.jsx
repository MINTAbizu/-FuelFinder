import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SIZES } from '../../constants/themes';

export default function StationCard({ name, distance, status, onPress }) {
  const getColor = () => {
    if (status === 'available') return COLORS.green;
    if (status === 'limited') return COLORS.yellow;
    if (status === 'empty') return COLORS.red;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={[styles.statusIndicator, { backgroundColor: getColor() }]} />
      <View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.distance}>{distance}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SIZES.padding,
    marginVertical: 8,
    marginHorizontal: SIZES.margin,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.borderRadius,
    shadowColor: COLORS.black,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  name: { fontSize: 16, fontWeight: 'bold', color: COLORS.black },
  distance: { fontSize: 14, color: COLORS.black, opacity: 0.6 },
});