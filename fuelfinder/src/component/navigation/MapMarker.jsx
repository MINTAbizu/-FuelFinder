import React from 'react';
import { Marker } from 'react-native-maps';
import { COLORS } from '../../constants/themes';

export default function MapMarker({ latitude, longitude, status }) {
  const getColor = () => {
    if (status === 'available') return COLORS.green;
    if (status === 'limited') return COLORS.yellow;
    if (status === 'empty') return COLORS.red;
  };

  return <Marker coordinate={{ latitude, longitude }} pinColor={getColor()} />;
}