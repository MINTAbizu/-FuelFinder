const axios = require("axios");

const chapaClient = axios.create({
  baseURL: "https://api.chapa.co/v1",
  timeout: 15000
});

function getChapaHeaders() {
  return {
    Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
    "Content-Type": "application/json"
  };
}

exports.initializePayment = async (paymentData) => {
  const response = await chapaClient.post(
    "/transaction/initialize",
    paymentData,
    { headers: getChapaHeaders() }
  );

  return response.data;
};

exports.verifyPayment = async (tx_ref) => {
  const response = await chapaClient.get(
    `/transaction/verify/${tx_ref}`,
    { headers: getChapaHeaders() }
  );

  return response.data;
};
