require('dotenv').config();
if (!process.env.API_KEY) {
  throw new Error('API_KEY is missing. Add it to your .env file.');
}
const app = require('./src/app');

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Clinic booking API running at http://localhost:${port}`);
});
