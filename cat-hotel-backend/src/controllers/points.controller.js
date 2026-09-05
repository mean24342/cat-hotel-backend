const asyncHandler = require('../utils/asyncHandler');
const pointsService = require('../services/points.service');

const getBalance = asyncHandler(async (req, res) => {
  const balance = await pointsService.getBalance(req.params.userId);
  res.json({ data: balance });
});

const getHistory = asyncHandler(async (req, res) => {
  const result = await pointsService.getHistory(req.params.userId, req.query);
  res.json(result);
});

const adjustPoints = asyncHandler(async (req, res) => {
  const result = await pointsService.adjustPoints(req.params.userId, req.body);
  res.status(201).json({ data: result });
});

module.exports = { getBalance, getHistory, adjustPoints };
