// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
// xml 2 json npm
// import xml2js from 'xml2js';
// export default async function handler(req, res) {
//      const response = await fetch('https://api.3geonames.org/?randomland=yes')
//         // read xml to json
//         const xml = await response.text();

//         console.log(xml);
//         const parser = new xml2js.Parser();
//         let output = null;
//         console.log('Parsing XML...');
//         parser.parseString(xml, function (err, result) {
//           if (err) {
//             console.error('Error:', err);
//           }
//           console.log(result.geodata.nearest[0]);
//           const lat = result.geodata.nearest[0].latt[0];
//           const long = result.geodata.nearest[0].longt[0];
//           output = { lat, long };
//           res.status(200).json(output);
//         });
// }
