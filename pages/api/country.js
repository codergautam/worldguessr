// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
// xml 2 json npm
 import * as lookup from "coordinate_to_country"
 export default async function handler(req, res) {

   const { lat, long } = req.query;
  if(!lat || !long) return res.status(400).json({address: {country: null}});
   const output = lookup(parseFloat(lat), parseFloat(long), true);
  if(output && output.length > 0)
          res.status(200).json({address: {country: output[0]}});
 } else {
  res.status(200).json({address: {country: null}});
 }
      
 }
