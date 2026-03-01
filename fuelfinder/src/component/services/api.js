import axios from "axios";

// Use your machine LAN IP for physical devices, e.g. http://192.168.1.20:5000/api
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

if (__DEV__) {
  // Useful to quickly verify which URL the app is calling.
  console.log("[API] baseURL =", API_BASE_URL);
}

export function setApiAccessToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export default api;
