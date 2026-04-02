import React from "react";
import HomeScreen from "./HomeScreen";

export default function ElectricHomeScreen(props) {
  return (
    <HomeScreen
      {...props}
      route={{
        ...(props.route || {}),
        params: {
          ...(props.route?.params || {}),
          stationType: "electric",
        },
      }}
    />
  );
}
