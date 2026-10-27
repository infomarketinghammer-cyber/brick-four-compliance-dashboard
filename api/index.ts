// Vercel serverless function: every /api/* request is rewritten here (see vercel.json) and handled by the Express app.
import { createApp } from '../server/app.js';

export default createApp();
