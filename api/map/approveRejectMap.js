import Map from "../../models/Map.js";
import User from "../../models/User.js";

export default async function handler(req, res) {
  // only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { secret, mapId, action, rejectReason, resubmittable } = req.body;
  // secret must be string
  if (typeof secret !== 'string' || typeof mapId !== 'string' || typeof action !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }
  // Validate input
  if (!secret || !mapId || !action) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  if(rejectReason && rejectReason.length > 50) {
    return res.status(400).json({ message: 'Reject reason must be 50 characters or less' });
  }

  let user = await User.findOne({ secret: secret });

  // Check if user exists and is a staff member
  if (!user || !user.staff) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  let map = await Map.findById(mapId);

  // Check if map exists and is in review
  if (!map || !map.in_review) {
    return res.status(404).json({ message: 'Map not found or not in review' });
  }

  if (action === 'approve') {
    // Approve the map
    map.accepted = true;
    map.in_review = false;
    await map.save();
    return res.status(200).json({ message: 'Map approved successfully' });
  } else if (action === 'reject') {
    // Validate reject reason and resubmittable
    if (!rejectReason || typeof resubmittable !== 'boolean') {
      return res.status(400).json({ message: 'Reject reason and resubmittable status are required' });
    }

    // Reject the map
    map.in_review = false;
    map.accepted = false;
    map.reject_reason = rejectReason;
    map.resubmittable = resubmittable;
    await map.save();
    return res.status(200).json({ message: 'Map rejected successfully with reason: ' + rejectReason });
  } else {
    return res.status(400).json({ message: 'Invalid action' });
  }
}
