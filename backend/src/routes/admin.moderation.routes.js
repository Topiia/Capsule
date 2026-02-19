const express = require('express');

const router = express.Router();
const Vlog = require('../models/Vlog');
const metricsService = require('../modules/moderation/metrics.service');
const trustScoreService = require('../modules/moderation/trust.score.service');
const sendEmail = require('../utils/sendEmail');

// PROTECT ALL ROUTES (Admin only)
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin'));

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
 * @desc Override Moderation Decision (Final Authority)
 * @route PATCH /api/admin/moderation/:id/override
 * @body { status: 'APPROVED' | 'REJECTED', reason: string }
 */
router.patch('/:id/override', async (req, res) => {
  try {
    const { status, reason } = req.body;
    const vlog = await Vlog.findById(req.params.id).populate('author');

    if (!vlog) return res.status(404).json({ success: false, message: 'Vlog not found' });

    // Prevent double override
    if (vlog.moderation && vlog.moderation.overriddenBy) {
      return res.status(400).json({
        success: false,
        message: 'Decision already overridden by admin',
      });
    }

    // 1. Audit Trail
    const previousStatus = vlog.status;

    // 2. Update Status & Visibility
    vlog.status = status;
    vlog.isPublic = (status === 'APPROVED'); // Enforce visibility rule

    // 3. Update Governance Metadata
    vlog.moderation = {
      ...vlog.moderation,
      overriddenBy: req.user.id,
      overriddenAt: new Date(),
      overrideReason: reason,
      previousStatus,
      reviewedAt: new Date(), // Keep strictly for display if needed
    };

    await vlog.save();

    // 4. Update Trust Score (Exact Logic)
    // Only update if status actually changed to/from something that affects trust
    if (vlog.author && status !== previousStatus) {
      if (['APPROVED', 'REJECTED'].includes(status)) {
        await trustScoreService.updateTrustScore(vlog.author._id, status);
      }

      // 5. Send Notification Email
      try {
        const subject = status === 'APPROVED'
          ? '🎉 Your Vlog has been Approved!'
          : '⚠️ Your Vlog has been Rejected';

        const message = status === 'APPROVED'
          ? `Great news! Your vlog "${vlog.title}" has been approved and is now public.\n\nReason/Note: ${reason}`
          : `We regret to inform you that your vlog "${vlog.title}" has been rejected.\n\nReason: ${reason}\n\nPlease review our community guidelines and try again.`;

        await sendEmail({
          to: vlog.author.email,
          subject,
          text: message,
        });
      } catch (emailError) {
        console.error('Failed to send moderation email:', emailError.message);
        // Don't fail the request if email fails
      }
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
