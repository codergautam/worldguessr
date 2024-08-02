import mapConst from "@/components/maps/mapConst";
import parseMapData from "@/components/utils/parseMapData";
import generateSlug from "@/components/utils/slugGenerator";
import Map from "@/models/Map";
import User from "@/models/User";

export default async function handler(req, res) {

  // only allow post
  if(req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let { action, secret, name, data, description_short, description_long } = req.body;

  if(!action || !secret) {
    return res.status(400).json({ message: 'Missing action or secret' });
  }

  // get user from secret
  const user = await User.findOne({
    secret: secret
  });

  if(!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // creating map
  if(action === 'create') {
    if(!name || !data || !description_short || !description_long) {
      return res.status(400).json({ message: 'Missing name, data, description_short, or description_long' });
    }

    name = name.trim();
    description_short = description_short.trim();
    description_long = description_long.trim();

    // validate name
    if(typeof name !== 'string' || name.length < mapConst.MIN_NAME_LENGTH  || name.length > mapConst.MAX_NAME_LENGTH) {
      return res.status(400).json({ message: `Name must be between ${mapConst.MIN_NAME_LENGTH} and ${mapConst.MAX_NAME_LENGTH} characters` });
    }

    // validate short description
    if(typeof description_short !== 'string' || description_short.length < mapConst.MIN_SHORT_DESCRIPTION_LENGTH || description_short.length > mapConst.MAX_SHORT_DESCRIPTION_LENGTH) {
      return res.status(400).json({ message: `Short description must be between ${mapConst.MIN_SHORT_DESCRIPTION_LENGTH} and ${mapConst.MAX_SHORT_DESCRIPTION_LENGTH} characters` });
    }

    // validate long description
    if(typeof description_long !== 'string' || description_long.length < mapConst.MIN_LONG_DESCRIPTION_LENGTH || description_long.length > mapConst.MAX_LONG_DESCRIPTION_LENGTH) {
      return res.status(400).json({ message: `Long description must be between ${mapConst.MIN_LONG_DESCRIPTION_LENGTH} and ${mapConst.MAX_LONG_DESCRIPTION_LENGTH} characters` });
    }

    // make sure short and long descriptions are different
    if(description_short === description_long) {
      return res.status(400).json({ message: 'Short and long descriptions must be different' });
    }

    const slug = generateSlug(name);

    // validate data
    const locationsData = parseMapData(data);
    if(!locationsData || locationsData.length < mapConst.MIN_LOCATIONS) {
      return res.status(400).json({ message: 'Need at least ' + mapConst.MIN_LOCATIONS + ' valid locations (got ' + (locationsData?.length ?? 0)+ ')' });
    }
    if(locationsData.length > mapConst.MAX_LOCATIONS) {
      return res.status(400).json({ message: `To make a map with more than ${mapConst.MAX_LOCATIONS} locations, please contact us at gautam@worldguessr.com` });
    }

    // make sure last map made over 1h ago
    const lastMap = await Map.findOne({ created_by: user._id }).sort({ created_at: -1 });
    if(lastMap && (Date.now() - lastMap.created_at.getTime()) < mapConst.MIN_MAP_INTERVAL) {
      const timeRemaining = mapConst.MIN_MAP_INTERVAL - (Date.now() - lastMap.created_at.getTime());
      return res.status(400).json({ message: 'Please wait at least ' + Math.round(timeRemaining / 1000 / 60) + ' minutes before creating another map' });
    }

    // make sure slug or name doesn't already exist
    const existing = await Map.findOne({ $or: [{ slug }, { name }] });
    if(existing) {
      return res.status(400).json({ message: 'Map with that name already exists' });
    }


    // create map
    const map = await Map.create({
      slug,
      name,
      created_by: user._id,
      data: locationsData,
      description_short,
      description_long
    });

    return res.status(200).json({ message: 'Map created', map });
  }


}
export const config = {
  api: {
      bodyParser: {
          sizeLimit: '4mb' // Set desired value here
      }
  }
}