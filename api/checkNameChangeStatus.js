import User from '../models/User.js';
import NameChangeRequest from '../models/NameChangeRequest.js';

/**
 * Check Name Change Status API
 * 
 * Returns the status of the user's pending name change request
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret } = req.body;

  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid secret' });
  }

  try {
    const user = await User.findOne({ secret });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has a pending name change requirement
    if (!user.pendingNameChange) {
      return res.status(200).json({
        hasPendingRequest: false,
        pendingNameChange: false
      });
    }

    // Check for existing request (pending or rejected)
    const existingRequest = await NameChangeRequest.findOne({
      'user.accountId': user._id.toString(),
      status: { $in: ['pending', 'rejected'] }
    }).sort({ createdAt: -1 }).lean();

    if (existingRequest) {
      return res.status(200).json({
        hasPendingRequest: existingRequest.status === 'pending',
        pendingNameChange: true,
        request: {
          requestedUsername: existingRequest.requestedUsername,
          status: existingRequest.status,
          rejectionReason: existingRequest.rejectionReason,
          rejectionCount: existingRequest.rejectionCount,
          createdAt: existingRequest.createdAt
        }
      });
    }

    // User needs to change name but hasn't submitted a request yet
    return res.status(200).json({
      hasPendingRequest: false,
      pendingNameChange: true,
      request: null
    });

  } catch (error) {
    console.error('Check name change status error:', error);
    return res.status(500).json({
      message: 'An error occurred',
      error: error.message
    });
  }
}

