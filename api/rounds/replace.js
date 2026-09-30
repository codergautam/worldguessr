import ratelimit from '../../components/utils/ratelimitMiddleware.js';
import { replaceHandler } from '../rounds.js';

export default ratelimit(replaceHandler, 20, 60000);
