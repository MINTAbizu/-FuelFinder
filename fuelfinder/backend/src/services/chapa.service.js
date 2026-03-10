const axios = require("axios");

exports.initializePayment = async (paymentData) => {

  const response = await axios.post(
    "https://api.chapa.co/v1/transaction/initialize",
    paymentData,
    {
      headers: {
        Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
};


exports.verifyPayment = async (tx_ref) => {

  const response = await axios.get(
    `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`
      }
    }
  );

  return response.data;
};