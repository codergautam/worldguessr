
export default function setCorsHeaders(response) {
  response.writeHeader('Access-Control-Allow-Origin', '*');
  response.writeHeader('Access-Control-Allow-Methods', 'GET');
  response.writeHeader('Access-Control-Allow-Headers', 'content-type');
}