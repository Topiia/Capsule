const express = require('express');

const router = express.Router();
const Vlog = require('../models/Vlog');
const metricsService = require('../modules/moderation/metrics.service');
const trustScoreService = require('../modules/moderation/trust.score.service');

// PROTECT ALL ROUTES (Admin only)
// Assuming 'admin' role exists in User model or just using authorized user for now
// In real prod, strictly verify roles.
// router.use(protect);
// router.use(authorize('admin'));

/**
 * @desc Get Flagged Vlogs
 * @route GET /api/admin/moderation/flagged
 */
router.get('/flagged', async (req, res) => {
  try {
    const vlogs = await Vlog.find({ status: { $in: ['FLAGGED', 'PENDING'] } })
      .populate('author', 'username email trustScore')
      .sort('-createdAt')
      .limit(50);
    res.json({ success: true, count: vlogs.length, data: vlogs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @desc Override Moderation Decision
 * @route PATCH /api/admin/moderation/:id/override
 * @body { status: 'APPROVED' | 'REJECTED', reason: string }
 */
router.patch('/:id/override', async (req, res) => {
  try {
    const { status, reason } = req.body;
    const vlog = await Vlog.findById(req.params.id).populate('author');

    if (!vlog) return res.status(404).json({ success: false, message: 'Vlog not found' });

    // Update status
    vlog.status = status;
    vlog.moderation.overrideReason = reason;
    vlog.moderation.reviewedAt = new Date();
    await vlog.save();

    // Valid statuses update trust score
    if (['APPROVED', 'REJECTED'].includes(status)) {
      await trustScoreService.updateTrustScore(vlog.author._id, status);
    }

    res.json({ success: true, data: vlog });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @desc Get Moderation Metrics
 * @route GET /api/admin/moderation/metrics
 */
router.get('/metrics', (req, res) => {
  res.json({
    success: true,
    data: metricsService.getMetrics(),
  });
});

module.exports = router;
