import formidable from 'formidable';
// import { OpenAI } from 'openai';
import fs from 'fs';
import User from '../../models/User.js';
import Clue from '../../models/Clue.js';

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

async function handler(req, res) {
  if (req.method === 'POST') {
    // Parse the incoming form data
    const form = formidable({});
    let fields;
    let files;
    try {
        [fields, files] = await form.parse(req);
        const secret = fields.secret[0];
        if(!secret) {
          return res.status(400).json({ message: 'Missing secret' });
        }
        // secret must be string
        if(typeof secret !== 'string') {
          return res.status(400).json({ message: 'Invalid input' });
        }

        // get user from secret
        const user = await User.findOne({
          secret: secret
        });
        if(!user) {
          return res.status(400).json({ message: 'User not found' });
        }

        if(!files.screenImage) {

          if(!user.canMakeClues) {
            return res.status(403).json({ message: 'User not authorized' });
          }
          // save a clue
          let { lat,lng, clueText } = fields;
          lat = parseFloat(lat[0]);
          lng = parseFloat(lng[0]);
          clueText = clueText[0];

          if(clueText && clueText.length > 1000) {
            return res.status(400).json({ message: 'Text too long' });
          }
          if(clueText && clueText.length < 100) {
            return res.status(400).json({ message: 'Text too short' });
          }
          if(!lat || !lng || !clueText) {
            return res.status(400).json({ message: 'Missing latLong or clueText' });
          }

          // make sure user doesnt have a clue in the same location
          const existingClue = await Clue.findOne({
            lat,
            lng,
            created_by: user._id
          });

          if(existingClue) {
            return res.status(400).json({ message: 'You already made an explanation here' });
          }

          // save the clue
          const clue = new Clue({
            lat,
            lng,
            clue: clueText,
            created_by: user._id
          });
          await clue.save();

          return res.status(200).json({ message: 'Clue saved' });


        } else {
          // if(!user.staff) {
            return res.status(403).json({ message: 'User not authorized' });
          // }

        // const filePath = files.screenImage[0].filepath
        // const base64 = fs.readFileSync(filePath).toString('base64');
        // // make the request to OpenAI
        // const response = await openai.chat.completions.create({
        //   model: "gpt-4o-mini",
        //   messages: [
        //     {
        //       role: "user",
        //       content: [
        //         { type: "text", text: "Based on the given street view image, discuss specific unique aspects of this place leading to what country it may be. Only mention direct and obvious aspects that are clearly in the image, mention what you looked at in your clues that directly narrow down the country/region. At the end, reveal the country."+(fields.country ? ` The country is ${fields.country}.` : "") },
        //         {
        //           type: "image_url",
        //           image_url: {
        //             "url": `data:image/png;base64,${base64}`,
        //           },
        //         },
        //       ],
        //     },
        //   ],
        // });
        // res.status(200).json({ message: response.choices[0].message.content[1].text });
        }

      } catch (err) {
      console.error(err);
        return res.status(500).json({ error: 'Error parsing form data' });
    }
  } else {
    // Handle any non-POST requests
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default handler;

export const config = {
  api: {
    bodyParser: false,
  },
};