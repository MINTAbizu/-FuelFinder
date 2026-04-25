const express = require("express");
const mapController = require("../controllers/mapController");
const promotionController = require("../controllers/promotionController");

const router = express.Router();

router.get("/cities", mapController.listDirectoryCities);
router.get("/current-city", mapController.resolveCurrentCity);
router.get("/nearby-fuel", mapController.getNearbyFuelStations);
router.get("/promotions", promotionController.listPublicPromotions);
router.get("/stations", mapController.listDirectoryStations);
router.get("/stations/:stationId", mapController.getStationDetails);
router.get("/route", mapController.getDrivingRoute);

module.exports = router;
