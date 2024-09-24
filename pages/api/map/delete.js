import Map from "@/models/Map";
import User from "@/models/User";

export default async function handler(req, res) {
  // only allow DELETE
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { secret, mapId } = req.body;
  // make sure string for mapId and secret
  if (typeof mapId !== 'string' || typeof secret !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  // Validate input
  if (!secret || !mapId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }
  if (typeof secret !== 'string' || typeof mapId !== 'string') {
    return res.status(400).json({ message: 'Invalid input' });
  }

  let user = await User.findOne({ secret: secret });

  // Check if user exists
  if (!user) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  let map = await Map.findById(mapId);

  // Check if map exists
  if (!map) {
    return res.status(404).json({ message: 'Map not found' });
  }

  // Check if the user is either the owner of the map or a staff member
  if (map.created_by.toString() !== user._id.toString() && !user.staff) {
    return res.status(403).json({ message: 'You do not have permission to delete this map' });
  }

  // Delete the map
  await Map.deleteOne({ _id: mapId });

  return res.status(200).json({ message: 'Map deleted successfully' });
}
