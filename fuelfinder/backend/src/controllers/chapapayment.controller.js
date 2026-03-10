const chapaService = require("../services/chapa.service");

exports.initialize = async (req, res) => {

  try {

    const tx_ref = "tx-" + Date.now();

    const paymentData = {
      amount: req.body.amount,
      currency: "ETB",
      email: req.body.email,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      tx_ref: tx_ref,
      callback_url: `${process.env.BASE_URL}/api/payments/callback`,
      return_url: "https://example.com/payment-success"
    };

    const response = await chapaService.initializePayment(paymentData);

    res.json(response);

  } catch (error) {

    res.status(500).json({
      message: "Payment initialization failed",
      error: error.response?.data || error.message
    });

  }

};


exports.verify = async (req, res) => {

  try {

    const tx_ref = req.params.tx_ref;

    const response = await chapaService.verifyPayment(tx_ref);

    res.json(response);

  } catch (error) {

    res.status(500).json({
      message: "Payment verification failed"
    });

  }

};