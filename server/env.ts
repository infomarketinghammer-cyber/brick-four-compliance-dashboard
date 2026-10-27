// Loads .env.local / .env for local runs. Imported first by server.ts so variables exist before other modules read them.
// On Vercel, environment variables come from the project settings instead.
import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env.local', '.env'], quiet: true });
