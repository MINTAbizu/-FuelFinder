// App.js
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HomeStack from "../screens/home/homestack";


// Create the QueryClient
const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HomeStack />
    </QueryClientProvider>
  );
}