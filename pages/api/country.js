// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
// xml 2 json npm
 import * as lookup from "coordinate_to_country"
 export default async function handler(req, res) {

   const { lat, long } = req.query;
   const output = lookup(53.218620, 6.567365, true);
          res.status(200).json(output);
      
 }
